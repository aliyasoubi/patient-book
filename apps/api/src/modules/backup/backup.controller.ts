import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { AuditService } from '../../application/services/audit.service';
import { UserRole } from '../../domain';
import { BackupService, type BackupSettings } from './backup.service';
import { UpdateBackupDirDto } from './dto/backup-settings.dto';

/**
 * Backup configuration, admin-only: redirecting where patient dumps are written
 * is a security-relevant act, so it is restricted and audited like one.
 */
@ApiTags('backup')
@Controller('backup')
@Roles(UserRole.Admin)
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Current backup destination and last run' })
  read(): Promise<BackupSettings> {
    return this.backup.read();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Change where backups are written' })
  async update(
    @Body() dto: UpdateBackupDirDto,
    @Req() req: Request,
    @CurrentUser() user: { id: string; username: string },
  ): Promise<BackupSettings> {
    const before = await this.backup.read();
    const settings = await this.backup.setDir(dto.dir);
    await this.audit.record({
      userId: user.id,
      username: user.username,
      action: 'update',
      entity: 'backup_settings',
      changes: { dir: { from: before.dir, to: settings.dir } },
      ip: req.ip ?? null,
    });
    return settings;
  }
}
