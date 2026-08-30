import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode, UserRole } from '../../domain';
import { ExportWorkbookUseCase } from './application/export-workbook.use-case';
import { ReconcileWorkbookUseCase } from './application/reconcile-workbook.use-case';
import { ApplyReconcileUseCase } from './application/apply-reconcile.use-case';
import { ApplyReconcileDto } from './dto/reconcile.dto';

/**
 * Excel export and guided-correction import for the patient book, both
 * admin-only: export is a bulk PII extract, and reconcile writes to real
 * patient records. See `apps/api/src/modules/import/` for the separate,
 * one-shot CLI migration tool this does not replace or reuse the write path of.
 */
@ApiTags('data-exchange')
@Controller('data-exchange')
@Roles(UserRole.Admin)
export class DataExchangeController {
  constructor(
    private readonly exportUseCase: ExportWorkbookUseCase,
    private readonly reconcileUseCase: ReconcileWorkbookUseCase,
    private readonly applyUseCase: ApplyReconcileUseCase,
  ) {}

  @Get('export')
  @ApiOperation({ summary: 'Download the current register as an Excel workbook' })
  async export(@Res() res: Response): Promise<void> {
    const buffer = await this.exportUseCase.execute();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="patient-book.xlsx"',
    });
    res.send(buffer);
  }

  /**
   * 8 MB is generous headroom over the practice's own workbook (under 1 MB)
   * while keeping a mistaken upload from being buffered whole in memory.
   */
  @Post('reconcile/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Diff an uploaded workbook against the current register' })
  async preview(@UploadedFile() file?: Express.Multer.File) {
    // The extension check in the browser is a convenience, not a guarantee —
    // the real validation is parsing it, which the use case turns into a
    // stable 400 rather than letting ExcelJS's error surface as a 500.
    if (!file?.buffer?.length) {
      throw AppException.badRequest(ErrorCode.WorkbookUnreadable);
    }
    return this.reconcileUseCase.execute(file.buffer);
  }

  @Post('reconcile/apply')
  @ApiOperation({ summary: 'Apply approved corrections from a reconcile preview' })
  apply(@Body() dto: ApplyReconcileDto, @CurrentUser('id') userId: string) {
    return this.applyUseCase.execute(dto, userId);
  }
}
