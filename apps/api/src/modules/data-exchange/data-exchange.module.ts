import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Patient } from '../patients/patient.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { OrthoCase } from '../ortho/ortho-case.entity';
import { PatientsModule } from '../patients/patients.module';
import { ImplantsModule } from '../implants/implants.module';
import { OrthoModule } from '../ortho/ortho.module';
import { DataExchangeController } from './data-exchange.controller';
import { ExportWorkbookUseCase } from './application/export-workbook.use-case';
import { ReconcileWorkbookUseCase } from './application/reconcile-workbook.use-case';
import { ApplyReconcileUseCase } from './application/apply-reconcile.use-case';
import { ExcelJsWorkbookWriter } from './infrastructure/exceljs-workbook.writer';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, ImplantCase, OrthoCase]),
    PatientsModule,
    ImplantsModule,
    OrthoModule,
  ],
  controllers: [DataExchangeController],
  providers: [
    ExportWorkbookUseCase,
    ReconcileWorkbookUseCase,
    ApplyReconcileUseCase,
    ExcelJsWorkbookWriter,
  ],
})
export class DataExchangeModule {}
