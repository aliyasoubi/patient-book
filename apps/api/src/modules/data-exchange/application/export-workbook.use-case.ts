import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../../patients/patient.entity';
import { ImplantCase } from '../../implants/implant-case.entity';
import { OrthoCase } from '../../ortho/ortho-case.entity';
import { ExcelJsWorkbookWriter } from '../infrastructure/exceljs-workbook.writer';

/** Snapshots the current register into the same workbook shape the importer reads. */
@Injectable()
export class ExportWorkbookUseCase {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ImplantCase) private readonly implants: Repository<ImplantCase>,
    @InjectRepository(OrthoCase) private readonly ortho: Repository<OrthoCase>,
    private readonly writer: ExcelJsWorkbookWriter,
  ) {}

  async execute(): Promise<Buffer> {
    const [patients, implants, ortho] = await Promise.all([
      this.patients.find({
        relations: { referralSource: true, treatments: { treatmentType: true } },
        order: { fileNo: 'ASC' },
      }),
      this.implants.find({ order: { registryNo: 'ASC' } }),
      this.ortho.find({ order: { registryNo: 'ASC' } }),
    ]);

    return this.writer.build({ patients, implants, ortho });
  }
}
