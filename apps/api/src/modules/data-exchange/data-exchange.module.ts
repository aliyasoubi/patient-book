import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Patient } from '../patients/patient.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { OrthoCase } from '../ortho/ortho-case.entity';
import { PatientsModule } from '../patients/patients.module';
import { ImplantsModule } from '../implants/implants.module';
import { OrthoModule } from '../ortho/ortho.module';
import { ExportWorkbookUseCase } from './application/export-workbook.use-case';
import { ReconcileWorkbookUseCase } from './application/reconcile-workbook.use-case';
import { ApplyReconcileUseCase } from './application/apply-reconcile.use-case';
import { ExcelJsWorkbookWriter } from './infrastructure/exceljs-workbook.writer';

/**
 * Excel export and guided-correction import for the patient book.
 *
 * Deliberately no controller and not imported by `AppModule`: this is
 * migration and clean-up tooling, not part of the clinic's daily work, so it
 * has no HTTP surface and no screen. It runs from the terminal — `run-export`
 * and `run-reconcile` build a Nest application context around this module —
 * on the machine that already holds the database credentials. The write path
 * is still the one the app uses ({@link ApplyReconcileUseCase} goes through
 * the services), so every correction is validated and audited the same way.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, ImplantCase, OrthoCase]),
    PatientsModule,
    ImplantsModule,
    OrthoModule,
  ],
  providers: [
    ExportWorkbookUseCase,
    ReconcileWorkbookUseCase,
    ApplyReconcileUseCase,
    ExcelJsWorkbookWriter,
  ],
  exports: [
    ExportWorkbookUseCase,
    ReconcileWorkbookUseCase,
    ApplyReconcileUseCase,
  ],
})
export class DataExchangeModule {}
