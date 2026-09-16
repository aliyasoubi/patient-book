import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../../patients/patient.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { ExcelJsWorkbookWriter } from '../infrastructure/exceljs-workbook.writer';

/**
 * How much of the register one export covered, for the audit trail. A type
 * alias rather than an interface so it satisfies the audit `changes` field's
 * `Record<string, unknown>` — interfaces carry no implicit index signature.
 */
export type ExportCounts = {
  patients: number;
  implants: number;
  ortho: number;
};

export interface ExportResult {
  buffer: Buffer;
  /** Row counts only — never the exported values themselves. */
  counts: ExportCounts;
}

/** Snapshots the current register into the same workbook shape the importer reads. */
@Injectable()
export class ExportWorkbookUseCase {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ImplantCase)
    private readonly implants: Repository<ImplantCase>,
    @InjectRepository(OrthoCase) private readonly ortho: Repository<OrthoCase>,
    private readonly writer: ExcelJsWorkbookWriter,
  ) {}

  async execute(): Promise<ExportResult> {
    const [patients, implants, ortho] = await Promise.all([
      this.patients.find({
        relations: {
          referralSource: true,
          treatments: { treatmentType: true },
        },
        order: { fileNo: 'ASC' },
      }),
      this.implants.find({ order: { registryNo: 'ASC' } }),
      this.ortho.find({ order: { registryNo: 'ASC' } }),
    ]);

    return {
      buffer: await this.writer.build({ patients, implants, ortho }),
      counts: {
        patients: patients.length,
        implants: implants.length,
        ortho: ortho.length,
      },
    };
  }
}
