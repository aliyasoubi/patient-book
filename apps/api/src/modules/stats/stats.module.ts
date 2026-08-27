import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../patients/patient.entity';
import { SurgeryQueueItem } from '../surgery/surgery-queue-item.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([Patient, SurgeryQueueItem])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
