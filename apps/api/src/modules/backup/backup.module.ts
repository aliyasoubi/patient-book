import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/** Backup configuration. AuditService arrives via the global ApplicationModule. */
@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
