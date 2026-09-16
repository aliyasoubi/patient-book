import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { WorkbookPort } from '../../../application/ports/workbook.port';
import {
  ErrorCode,
  PatientNameMatcher,
  classifyReferral,
  normalizeForDisplay,
  searchKey,
} from '../../../domain';
import { Patient } from '../../patients/patient.entity';
import { PatientTreatment } from '../../treatments/patient-treatment.entity';
import { ReferralSource } from '../../treatments/referral-source.entity';
import { TreatmentType } from '../../treatments/treatment-type.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { SurgeryQueueItem } from '../../surgery/surgery-queue-item.entity';
import { PatientRowMapper } from '../infrastructure/row-mappers/patient-row.mapper';
import { RegistryRowMapper } from '../infrastructure/row-mappers/registry-row.mapper';
import { SurgeryRowMapper } from '../infrastructure/row-mappers/surgery-row.mapper';
import {
  ImportReport,
  SheetReport,
  SkipReason,
  countSkip,
  emptySheetReport,
} from './import-report';

/**
 * Worksheet names, exactly as the practice's workbook spells them. These are
 * data, not labels — renaming one here silently makes a sheet unreadable.
 */
export const SHEET = {
  patients: 'پرونده',
  implants: 'بیماران ایمپلنت',
  ortho: 'بیماران ارتو',
  surgery: 'لیست انتظار جراحی',
} as const;

/** Rows are written in batches; one statement per row is needlessly slow. */
const CHUNK = 200;

/**
 * Migrates the practice's workbook into the database.
 *
 * This class only orchestrates: it reads rows through a {@link WorkbookPort},
 * hands each sheet to its mapper, and persists the results. Every rule about
 * what a column means lives in a mapper, and every rule about identity lives in
 * {@link PatientNameMatcher} — so this file stays about sequencing and
 * transactions, which is the one thing it is actually responsible for.
 *
 * The whole workbook lands in a single transaction: a failure halfway through
 * must not leave the register half-migrated.
 */
@Injectable()
export class ImportWorkbookUseCase {
  private readonly logger = new Logger(ImportWorkbookUseCase.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly workbook: WorkbookPort,
  ) {}

  async execute(filePath: string): Promise<ImportReport> {
    const report: ImportReport = {
      startedAt: new Date(),
      finishedAt: null,
      sheets: {},
      warnings: [],
    };

    await this.workbook.open(filePath);

    await this.dataSource.transaction(async (manager) => {
      const matcher = await this.importPatients(manager, report);
      const implantsByNumber = await this.importImplants(
        manager,
        report,
        matcher,
      );
      await this.importOrtho(manager, report, matcher);
      await this.importSurgeryQueue(manager, report, implantsByNumber);
    });

    report.finishedAt = new Date();
    return report;
  }

  // -- Main patient book -------------------------------------------------

  private async importPatients(
    manager: EntityManager,
    report: ImportReport,
  ): Promise<PatientNameMatcher> {
    const sheet: SheetReport = emptySheetReport();
    report.sheets[SHEET.patients] = sheet;

    const mapper = new PatientRowMapper();
    const referrals = new Map<string, ReferralSource>(
      (await manager.find(ReferralSource)).map((s) => [s.normalizedName, s]),
    );
    const treatments = new Map<string, TreatmentType>(
      (await manager.find(TreatmentType)).map((t) => [t.code, t]),
    );

    const seenFileNumbers = new Set<string>();
    const staged: Array<{ patient: Patient; treatmentCodes: string[] }> = [];

    for (const row of this.workbook.rows(SHEET.patients)) {
      sheet.rowsRead++;

      const mapped = mapper.map(row);
      if (!mapped) {
        countSkip(
          sheet,
          row.cell(1) ? SkipReason.ReservedFileNumber : SkipReason.NoFileNumber,
        );
        continue;
      }
      if (seenFileNumbers.has(mapped.patient.fileNo)) {
        countSkip(sheet, SkipReason.DuplicateFileNumber);
        continue;
      }
      seenFileNumbers.add(mapped.patient.fileNo);

      if (mapped.referralRaw) {
        mapped.patient.referralSource = this.resolveReferral(
          referrals,
          mapped.referralRaw,
        );
      }
      for (const issue of mapped.issues) {
        report.warnings.push({
          sheet: SHEET.patients,
          row: row.rowNumber,
          field: issue.field,
          code: issue.code,
          params: issue.params,
          rawValue: issue.rawValue,
        });
      }
      staged.push({
        patient: mapped.patient,
        treatmentCodes: mapped.treatmentCodes,
      });
    }

    const newReferrals = [...referrals.values()].filter((s) => !s.id);
    if (newReferrals.length) await manager.save(ReferralSource, newReferrals);

    const saved = await manager.save(
      Patient,
      staged.map((s) => s.patient),
      { chunk: CHUNK },
    );
    sheet.imported = saved.length;

    await this.linkTreatments(manager, staged, treatments);

    const matcher = new PatientNameMatcher();
    for (const patient of saved) {
      matcher.index(patient.firstName, patient.lastName, patient.id);
    }
    return matcher;
  }

  private resolveReferral(
    cache: Map<string, ReferralSource>,
    raw: string,
  ): ReferralSource {
    const key = searchKey(raw);
    const existing = cache.get(key);
    if (existing) return existing;

    const source = new ReferralSource();
    source.name = normalizeForDisplay(raw);
    source.normalizedName = key;
    source.kind = classifyReferral(raw);
    cache.set(key, source);
    return source;
  }

  private async linkTreatments(
    manager: EntityManager,
    staged: Array<{ patient: Patient; treatmentCodes: string[] }>,
    treatments: Map<string, TreatmentType>,
  ): Promise<void> {
    const links: PatientTreatment[] = [];
    for (const { patient, treatmentCodes } of staged) {
      for (const code of treatmentCodes) {
        const type = treatments.get(code);
        if (!type) continue;
        const link = new PatientTreatment();
        link.patientId = patient.id;
        link.treatmentTypeId = type.id;
        links.push(link);
      }
    }
    if (!links.length) return;
    await manager.save(PatientTreatment, links, { chunk: 500 });
    this.logger.log(
      `Linked ${links.length} treatments across ${staged.length} patients`,
    );
  }

  // -- Registers ---------------------------------------------------------

  private async importImplants(
    manager: EntityManager,
    report: ImportReport,
    matcher: PatientNameMatcher,
  ): Promise<Map<string, ImplantCase>> {
    const rows = await this.importRegistry(
      manager,
      report,
      matcher,
      SHEET.implants,
      ImplantCase,
    );
    return new Map(rows.map((c) => [c.registryNo, c]));
  }

  private async importOrtho(
    manager: EntityManager,
    report: ImportReport,
    matcher: PatientNameMatcher,
  ): Promise<void> {
    await this.importRegistry(manager, report, matcher, SHEET.ortho, OrthoCase);
  }

  /**
   * The implant and orthodontic books differ only in which table they land in,
   * so one routine serves both rather than two near-identical copies.
   */
  private async importRegistry<T extends ImplantCase | OrthoCase>(
    manager: EntityManager,
    report: ImportReport,
    matcher: PatientNameMatcher,
    sheetName: string,
    Entity: new () => T,
  ): Promise<T[]> {
    const sheet: SheetReport = emptySheetReport();
    sheet.matched = { exact: 0, fuzzy: 0, unmatched: 0 };
    report.sheets[sheetName] = sheet;

    const mapper = new RegistryRowMapper(matcher);
    const seen = new Set<string>();
    const staged: T[] = [];

    for (const row of this.workbook.rows(sheetName)) {
      sheet.rowsRead++;

      const mapped = mapper.map(row);
      if (!mapped) {
        countSkip(sheet, SkipReason.NoRegistryNumber);
        continue;
      }
      if (seen.has(mapped.registryNo)) {
        countSkip(sheet, SkipReason.DuplicateRegistryNumber);
        continue;
      }
      seen.add(mapped.registryNo);

      const entity = Object.assign(new Entity(), mapped);
      staged.push(entity);

      // `manual` cannot occur here — an import only ever infers a link.
      const tallied =
        mapped.matchMethod === 'manual' ? 'unmatched' : mapped.matchMethod;
      sheet.matched[tallied]++;
      if (mapped.matchMethod === 'unmatched' && mapped.recordedName) {
        report.warnings.push({
          sheet: sheetName,
          row: row.rowNumber,
          field: 'patient',
          code: ErrorCode.PatientNotFound,
          params: { name: mapped.recordedName },
        });
      }
    }

    const saved = await manager.save(Entity, staged, { chunk: CHUNK });
    sheet.imported = saved.length;
    return saved;
  }

  // -- Surgery waiting list ---------------------------------------------

  private async importSurgeryQueue(
    manager: EntityManager,
    report: ImportReport,
    implantsByNumber: Map<string, ImplantCase>,
  ): Promise<void> {
    const sheet: SheetReport = emptySheetReport();
    report.sheets[SHEET.surgery] = sheet;

    const mapper = new SurgeryRowMapper();
    const staged: SurgeryQueueItem[] = [];

    for (const row of this.workbook.rows(SHEET.surgery)) {
      sheet.rowsRead++;

      const mapped = mapper.map(row);
      if (!mapped) {
        countSkip(sheet, SkipReason.EmptyRow);
        continue;
      }

      const item = Object.assign(
        new SurgeryQueueItem(),
        mapped,
      ) as SurgeryQueueItem;
      delete (item as Partial<SurgeryQueueItem> & { dateProblem?: unknown })
        .dateProblem;

      if (mapped.dateProblem) {
        report.warnings.push({
          sheet: SHEET.surgery,
          row: row.rowNumber,
          field: 'surgeryDate',
          code: mapped.dateProblem.code,
          params: mapped.dateProblem.params,
          rawValue: mapped.dateProblem.rawValue,
        });
      }

      this.linkToImplantRegister(
        item,
        mapped.implantRegistryNo,
        implantsByNumber,
        report,
        row.rowNumber,
      );
      staged.push(item);
    }

    const saved = await manager.save(SurgeryQueueItem, staged, {
      chunk: CHUNK,
    });
    sheet.imported = saved.length;
  }

  /**
   * Attach a waiting-list row to its implant register entry.
   *
   * The register has reused numbers over the years, so where the quoted name
   * disagrees with the register's the row is flagged rather than silently
   * attached to whoever holds that number today.
   */
  private linkToImplantRegister(
    item: SurgeryQueueItem,
    registryNo: string | null,
    register: Map<string, ImplantCase>,
    report: ImportReport,
    rowNumber: number,
  ): void {
    if (!registryNo) return;

    const implantCase = register.get(registryNo);
    if (!implantCase) {
      report.warnings.push({
        sheet: SHEET.surgery,
        row: rowNumber,
        field: 'implantRegistryNo',
        code: ErrorCode.RegistryCaseNotFound,
        params: { registryNo },
      });
      return;
    }

    item.implantCaseId = implantCase.id;
    item.hasNameMismatch = PatientNameMatcher.namesDiffer(
      implantCase.recordedName,
      item.recordedName,
    );
    if (item.hasNameMismatch) {
      report.warnings.push({
        sheet: SHEET.surgery,
        row: rowNumber,
        field: 'patientIdentity',
        code: ErrorCode.RegistryNumberTaken,
        params: {
          registryNo,
          registeredName: implantCase.recordedName,
          listedName: item.recordedName,
        },
      });
    }
  }
}
