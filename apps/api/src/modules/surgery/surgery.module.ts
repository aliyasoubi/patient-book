import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { FollowUpContact } from './follow-up-contact.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import { SurgeryController } from './surgery.controller';
import { SurgeryService } from './surgery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurgeryQueueItem, FollowUpContact, ImplantCase]),
  ],
  controllers: [SurgeryController],
  providers: [SurgeryService],
  exports: [SurgeryService],
})
export class SurgeryModule {}
