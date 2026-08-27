import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../infrastructure/persistence/entities/audit-log.entity';
import { AuditService } from './services/audit.service';

/**
 * Cross-cutting application services. Global so any feature module can depend
 * on them without re-importing, and so the audit trail cannot be forgotten.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class ApplicationModule {}
