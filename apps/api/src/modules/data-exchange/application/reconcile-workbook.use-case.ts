import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../../patients/patient.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { ExcelJsWorkbookReader } from '../../import/infrastructure/exceljs-workbook.reader';
import { PatientRowMapper } from '../../import/infrastructure/row-mappers/patient-row.mapper';
import { REGISTRY_COLUMN } from '../../import/infrastructure/row-mappers/registry-row.mapper';
import { SHEET } from '../../import/application/import-workbook.use-case';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode, LandlineNumber, MobileNumber, normalizeForDisplay } from '../../../domain';
import {
  PATIENT_FIELD_READERS,
  REGISTRY_FIELD_READERS,
  RegistryLike,
} from './field-readers';
import { CaseDiff, FieldDiff, PatientDiff, ReconcilePreviewResult } from '../dto/reconcile.dto';

/**
 * A blank or unclassified sheet cell must never propose erasing an existing
 * value, so these two only ever propose a *recognised* bucket.
 */
const NEVER_PROPOSE_UNKNOWN: Readonly<Record<string, string>> = {
  gender: 'unknown',
  education: 'unknown',
};

/**
 * Diffs an uploaded workbook against the current register.
 *
 * Read-only: computes what *would* change without writing anything. Only
 * fields the sheet actually provides a non-empty value for are ever proposed —
 * a blank source cell never suggests clearing data the app already holds.
 * Treatment columns are not compared at all (see {@link PATIENT_FIELD_READERS}).
 *
 * Every `current` reported here is echoed back by the client on apply and
 * re-checked against the database, so a preview that has gone stale is
 * refused rather than applied blind.
 */
@Injectable()
export class ReconcileWorkbookUseCase {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ImplantCase) private readonly implants: Repository<ImplantCase>,
    @InjectRepository(OrthoCase) private readonly ortho: Repository<OrthoCase>,
  ) {}

  async execute(buffer: Buffer): Promise<ReconcilePreviewResult> {
    const reader = await this.read(buffer);

    const [allPatients, allImplants, allOrtho] = await Promise.all([
      this.patients.find({ relations: { referralSource: true } }),
      this.implants.find(),
      this.ortho.find(),
    ]);

    const patients = this.diffPatients(reader, allPatients);
    const implants = this.diffRegistry(
      reader,
      SHEET.implants,
      new Map(allImplants.map((c) => [c.registryNo, c])),
    );
    const ortho = this.diffRegistry(
      reader,
      SHEET.ortho,
      new Map(allOrtho.map((c) => [c.registryNo, c])),
    );

    return {
      patients: patients.diffs,
      implants: implants.diffs,
      ortho: ortho.diffs,
      unmatched: {
        patients: patients.unmatched,
        implants: implants.unmatched,
        ortho: ortho.unmatched,
      },
    };
  }

  /**
   * Parse the upload, turning both failure modes into stable 400s. Without
   * this, ExcelJS's own error escapes as a bare `Error` and the global filter
   * can only report it as an unexpected 500 — a wrong file is a mistake the
   * user can fix, not a server fault.
   */
  private async read(buffer: Buffer): Promise<ExcelJsWorkbookReader> {
    const reader = new ExcelJsWorkbookReader();
    try {
      await reader.openBuffer(buffer);
    } catch {
      throw AppException.badRequest(ErrorCode.WorkbookUnreadable);
    }

    const names = new Set(reader.sheetNames());
    const known = [SHEET.patients, SHEET.implants, SHEET.ortho].filter((s) => names.has(s));
    if (!known.length) {
      throw AppException.badRequest(ErrorCode.WorkbookSheetsMissing, {
        expected: [SHEET.patients, SHEET.implants, SHEET.ortho].join('، '),
      });
    }
    return reader;
  }

  private diffPatients(
    reader: ExcelJsWorkbookReader,
    allPatients: Patient[],
  ): { diffs: PatientDiff[]; unmatched: number } {
    const byFileNo = new Map(allPatients.map((p) => [p.fileNo, p]));
    const mapper = new PatientRowMapper();
    const diffs: PatientDiff[] = [];
    let unmatched = 0;

    for (const row of reader.rows(SHEET.patients)) {
      const mapped = mapper.map(row);
      if (!mapped) continue;

      const existing = byFileNo.get(mapped.patient.fileNo);
      if (!existing) {
        unmatched++;
        continue;
      }

      const fields: FieldDiff[] = [];
      for (const [field, read] of Object.entries(PATIENT_FIELD_READERS)) {
        // The mapper hands back a referral as raw text, not a linked entity.
        const proposed =
          field === 'referralSourceName'
            ? normalizeForDisplay(mapped.referralRaw) || null
            : read(mapped.patient);

        if (!proposed) continue;
        if (NEVER_PROPOSE_UNKNOWN[field] === proposed) continue;

        const current = read(existing);
        if (proposed === current) continue;
        fields.push({ field, current, proposed });
      }

      if (fields.length) {
        diffs.push({
          id: existing.id,
          fileNo: existing.fileNo,
          fullName: existing.fullName,
          fields,
        });
      }
    }

    return { diffs, unmatched };
  }

  private diffRegistry<T extends RegistryLike>(
    reader: ExcelJsWorkbookReader,
    sheetName: string,
    byRegistryNo: Map<string, T>,
  ): { diffs: CaseDiff[]; unmatched: number } {
    const diffs: CaseDiff[] = [];
    let unmatched = 0;

    for (const row of reader.rows(sheetName)) {
      const registryNo = row.cell(REGISTRY_COLUMN.registryNo);
      if (!registryNo) continue;

      const existing = byRegistryNo.get(registryNo);
      if (!existing) {
        unmatched++;
        continue;
      }

      const proposals: Readonly<Record<string, string | null>> = {
        recordedName: row.cell(REGISTRY_COLUMN.fullName) || null,
        mobile: MobileNumber.normalise(row.cell(REGISTRY_COLUMN.mobile)),
        homePhone: LandlineNumber.normalise(row.cell(REGISTRY_COLUMN.homePhone)),
      };

      const fields: FieldDiff[] = [];
      for (const [field, read] of Object.entries(REGISTRY_FIELD_READERS)) {
        const proposed = proposals[field];
        if (!proposed) continue;
        const current = read(existing);
        if (proposed === current) continue;
        fields.push({ field, current, proposed });
      }

      if (fields.length) {
        diffs.push({
          id: existing.id,
          registryNo: existing.registryNo,
          recordedName: existing.recordedName,
          fields,
        });
      }
    }

    return { diffs, unmatched };
  }
}
