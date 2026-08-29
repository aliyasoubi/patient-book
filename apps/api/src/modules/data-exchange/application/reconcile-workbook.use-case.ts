import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../../patients/patient.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { ExcelJsWorkbookReader } from '../../import/infrastructure/exceljs-workbook.reader';
import {
  MappedPatientRow,
  PatientRowMapper,
} from '../../import/infrastructure/row-mappers/patient-row.mapper';
import { REGISTRY_COLUMN } from '../../import/infrastructure/row-mappers/registry-row.mapper';
import { SHEET } from '../../import/application/import-workbook.use-case';
import { LandlineNumber, MobileNumber, normalizeForDisplay } from '../../../domain';
import { CaseDiff, FieldDiff, PatientDiff, ReconcilePreviewResult } from '../dto/reconcile.dto';

/** Registry-case fields the workbook can propose changing. */
interface RegistryLike {
  id: string;
  registryNo: string;
  recordedName: string;
  mobile: string | null;
  homePhone: string | null;
}

/** Simple text fields compared as-is between the sheet and the current record. */
const PATIENT_TEXT_FIELDS: ReadonlyArray<{ field: string; get: (p: Patient) => string | null }> = [
  { field: 'firstName', get: (p) => p.firstName || null },
  { field: 'lastName', get: (p) => p.lastName || null },
  { field: 'fatherName', get: (p) => p.fatherName },
  { field: 'nationalId', get: (p) => p.nationalId },
  { field: 'gender', get: (p) => p.gender },
  { field: 'mobile', get: (p) => p.mobile },
  { field: 'homePhone', get: (p) => p.homePhone },
  { field: 'occupation', get: (p) => p.occupation },
  { field: 'education', get: (p) => p.education },
  { field: 'medicalHistory', get: (p) => p.medicalHistory },
  { field: 'homeAddress', get: (p) => p.homeAddress },
  { field: 'workAddress', get: (p) => p.workAddress },
];

/** Jalali dates are compared and proposed by their raw text, same as `UpdatePatientDto` accepts. */
const PATIENT_DATE_FIELDS: ReadonlyArray<{ field: string; get: (p: Patient) => string | null }> = [
  { field: 'birthDate', get: (p) => p.birthDateRaw },
  { field: 'firstVisitAt', get: (p) => p.firstVisitRaw },
  { field: 'lastVisitAt', get: (p) => p.lastVisitRaw },
];

/** A blank or unclassified sheet cell must never propose erasing an existing value. */
const NEVER_PROPOSE_UNKNOWN = new Set(['gender', 'education']);

/**
 * Diffs an uploaded workbook against the current register.
 *
 * Read-only: computes what *would* change without writing anything. Only
 * fields the sheet actually provides a non-empty value for are ever
 * proposed — a blank source cell never suggests clearing data the app
 * already holds. Treatment-history columns are intentionally not compared;
 * those already have their own in-app edit path.
 */
@Injectable()
export class ReconcileWorkbookUseCase {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ImplantCase) private readonly implants: Repository<ImplantCase>,
    @InjectRepository(OrthoCase) private readonly ortho: Repository<OrthoCase>,
  ) {}

  async execute(buffer: Buffer): Promise<ReconcilePreviewResult> {
    const reader = new ExcelJsWorkbookReader();
    await reader.openBuffer(buffer);

    const [allPatients, allImplants, allOrtho] = await Promise.all([
      this.patients.find({ relations: { referralSource: true } }),
      this.implants.find(),
      this.ortho.find(),
    ]);

    const { diffs: patientDiffs, unmatched: patientsUnmatched } = this.diffPatients(
      reader,
      allPatients,
    );
    const { diffs: implantDiffs, unmatched: implantsUnmatched } = this.diffRegistry(
      reader,
      SHEET.implants,
      new Map(allImplants.map((c) => [c.registryNo, c])),
    );
    const { diffs: orthoDiffs, unmatched: orthoUnmatched } = this.diffRegistry(
      reader,
      SHEET.ortho,
      new Map(allOrtho.map((c) => [c.registryNo, c])),
    );

    return {
      patients: patientDiffs,
      implants: implantDiffs,
      ortho: orthoDiffs,
      unmatched: {
        patients: patientsUnmatched,
        implants: implantsUnmatched,
        ortho: orthoUnmatched,
      },
    };
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

      const fields = this.diffPatientFields(mapped, existing);
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

  private diffPatientFields(mapped: MappedPatientRow, existing: Patient): FieldDiff[] {
    const fields: FieldDiff[] = [];

    for (const { field, get } of PATIENT_TEXT_FIELDS) {
      const proposed = get(mapped.patient);
      if (!proposed) continue;
      if (NEVER_PROPOSE_UNKNOWN.has(field) && proposed === 'unknown') continue;
      const current = get(existing);
      if (proposed === current) continue;
      fields.push({ field, current, proposed });
    }

    for (const { field, get } of PATIENT_DATE_FIELDS) {
      const proposed = get(mapped.patient);
      if (!proposed) continue;
      const current = get(existing);
      if (proposed === current) continue;
      fields.push({ field, current, proposed });
    }

    const proposedReferral = mapped.referralRaw ? normalizeForDisplay(mapped.referralRaw) : null;
    const currentReferral = existing.referralSource?.name ?? null;
    if (proposedReferral && proposedReferral !== currentReferral) {
      fields.push({
        field: 'referralSourceName',
        current: currentReferral,
        proposed: proposedReferral,
      });
    }

    return fields;
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

      const fields: FieldDiff[] = [];
      const proposedName = row.cell(REGISTRY_COLUMN.fullName);
      if (proposedName && proposedName !== existing.recordedName) {
        fields.push({ field: 'recordedName', current: existing.recordedName, proposed: proposedName });
      }

      const proposedMobile = MobileNumber.normalise(row.cell(REGISTRY_COLUMN.mobile));
      if (proposedMobile && proposedMobile !== existing.mobile) {
        fields.push({ field: 'mobile', current: existing.mobile, proposed: proposedMobile });
      }

      const proposedHomePhone = LandlineNumber.normalise(row.cell(REGISTRY_COLUMN.homePhone));
      if (proposedHomePhone && proposedHomePhone !== existing.homePhone) {
        fields.push({
          field: 'homePhone',
          current: existing.homePhone,
          proposed: proposedHomePhone,
        });
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
