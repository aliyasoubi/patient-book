import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { Patient } from '../patients/patient.entity';
import { SurgeryController } from './surgery.controller';
import { SurgeryService } from './surgery.service';

@Module({
  imports: [TypeOrmModule.forFeature([SurgeryQueueItem, ImplantCase, Patient])],
  controllers: [SurgeryController],
  providers: [SurgeryService],
})
export class SurgeryModule {}
