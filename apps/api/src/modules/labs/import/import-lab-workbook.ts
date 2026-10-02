import { DataSource } from 'typeorm';

import { WorkbookPort } from '../../../application/ports/workbook.port';
import { AuditService } from '../../../application/services/audit.service';
import { AuditLog } from '../../../infrastructure/persistence/entities/audit-log.entity';
import { PatientNameMatcher, searchKey, storedDate } from '../../../domain';
import type { MatchMethod } from '../../../domain';
import { Patient } from '../../patients/patient.entity';
import { Lab } from '../lab.entity';
import { LabCase } from '../lab-case.entity';
import { LabTrip } from '../lab-trip.entity';
import { expectedReturn, todayIso } from '../lab-stage';
import { LabSheetCase, locateColumns, mapLabRow } from './lab-row.mapper';

/** A row that will become a case, with the lab and patient it resolved to. */
export interface PlannedLabCase {
  row: LabSheetCase;
  labId: string;
  patient: { id: string; fileNo: string } | null;
  match: MatchMethod;
}

export interface LabImportPlan {
  sheet: string;
  cases: PlannedLabCase[];
  skipped: Array<{ rowNumber: number; recordedName: string; reason: string }>;
  empty: number;
}

/** The book has no "came back on" column: the import day stands in, and says so. */
const UNKNOWN_RETURN_NOTE = 'از دفتر وارد شد؛ تاریخ برگشت در دفتر ثبت نشده بود';

/**
 * One-time load of the practice's lab book (لابراتوار.xlsx) into the board.
 *
 * Reads the first sheet, resolves each row's lab against the catalogue and its
 * name against the patient book (the same conservative {@link
 * PatientNameMatcher} the main importer uses: an ambiguous name stays
 * unlinked), and plans one case per row with that row's trip as its only
 * trip. {@link plan} writes nothing; {@link apply} writes the plan in one
 * transaction, audited as the operator who ran it.
 */
export class ImportLabWorkbook {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reader: WorkbookPort,
  ) {}

  async plan(filePath: string): Promise<LabImportPlan> {
    await this.reader.open(filePath);
    const sheet = this.reader.sheetNames()[0];
    if (!sheet) throw new Error('the workbook has no sheets');
    const located = locateColumns(this.reader.header(sheet));
    if (!located.ok) {
      throw new Error(
        `sheet «${sheet}» is missing columns: ${located.missing.join('، ')}`,
      );
    }

    const labs = await this.dataSource.getRepository(Lab).find();
    const labByName = new Map(labs.map((l) => [l.normalizedName, l]));

    const patients = await this.dataSource.getRepository(Patient).find({
      select: { id: true, firstName: true, lastName: true, fileNo: true },
    });
    const matcher = new PatientNameMatcher();
    for (const p of patients) matcher.index(p.firstName, p.lastName, p.id);
    const fileNoById = new Map(patients.map((p) => [p.id, p.fileNo]));

    const plan: LabImportPlan = { sheet, cases: [], skipped: [], empty: 0 };
    const seenNames = new Map<string, number>();
    for (const sheetRow of this.reader.rows(sheet)) {
      const result = mapLabRow(sheetRow, located.columns);
      if (result.kind === 'empty') {
        plan.empty++;
        continue;
      }
      if (result.kind === 'skipped') {
        plan.skipped.push(result);
        continue;
      }
      const row = result.value;
      const lab = labByName.get(searchKey(row.labName));
      if (!lab) {
        plan.skipped.push({
          rowNumber: row.rowNumber,
          recordedName: row.recordedName,
          reason: `lab «${row.labName}» is not in Settings → labs; add it there and re-run`,
        });
        continue;
      }
      const nameKey = searchKey(row.recordedName);
      const earlier = seenNames.get(nameKey);
      if (earlier) {
        row.warnings.push(
          `same name as row ${earlier}: imported as a separate case`,
        );
      } else seenNames.set(nameKey, row.rowNumber);

      const match = matcher.match(row.recordedName);
      plan.cases.push({
        row,
        labId: lab.id,
        patient: match.patientId
          ? { id: match.patientId, fileNo: fileNoById.get(match.patientId)! }
          : null,
        match: match.method,
      });
    }
    return plan;
  }

  /** Write the plan: every case and its trip, or — on any failure — nothing. */
  async apply(plan: LabImportPlan, actor: string): Promise<number> {
    const today = storedDate(todayIso());
    return this.dataSource.transaction(async (manager) => {
      const audit = new AuditService(manager.getRepository(AuditLog));
      for (const { row, labId, patient } of plan.cases) {
        const back = row.stage !== 'at_lab';
        const saved = await manager.getRepository(LabCase).save(
          manager.getRepository(LabCase).create({
            patientId: patient?.id ?? null,
            recordedName: row.recordedName,
            labId,
            workTypes: row.workTypes,
            toothCount: row.toothCount,
            teeth: row.teeth,
            implantBrand: row.implantBrand,
            impressionCount: row.impressionCount,
            analogCount: row.analogCount,
            partsReturnedAt: row.partsReturnedAt,
            deliveredAt: row.stage === 'delivered' ? today : null,
            notes: [
              `از دفتر لابراتوار، ردیف ${row.rowNumber}`,
              ...row.leftovers,
            ].join('\n'),
            searchText: searchKey(
              [row.recordedName, patient?.fileNo, row.teeth, row.implantBrand]
                .filter(Boolean)
                .join(' '),
            ),
          }),
        );
        await manager.getRepository(LabTrip).save(
          manager.getRepository(LabTrip).create({
            labCaseId: saved.id,
            sequence: 1,
            kind: row.tripKind,
            sentAt: row.sentAt,
            waitDays: row.waitDays,
            expectedAt: expectedReturn(row.sentAt, row.waitDays),
            receivedAt: back ? today : null,
            note: back ? UNKNOWN_RETURN_NOTE : null,
          }),
        );
        await audit.recordRequired(
          {
            userId: null,
            username: actor,
            action: 'create',
            entity: 'lab_case',
            entityId: saved.id,
            changes: { importedFromRow: row.rowNumber, stage: row.stage },
          },
          manager,
        );
      }
      return plan.cases.length;
    });
  }
}
