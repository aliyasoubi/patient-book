import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from '../inventory/inventory-item.entity';
import { Patient } from '../patients/patient.entity';
import { SurgeryQueueItem } from '../surgery/surgery-queue-item.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { MaterialConsumptionService } from './material-consumption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, SurgeryQueueItem, InventoryItem]),
  ],
  controllers: [StatsController],
  providers: [StatsService, MaterialConsumptionService],
})
export class StatsModule {}
