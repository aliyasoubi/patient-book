import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InventoryItem } from './inventory-item.entity';
import { InventoryLot } from './inventory-lot.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ImplantsModule } from '../implants/implants.module';
import { SurgeryModule } from '../surgery/surgery.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem, InventoryLot, InventoryMovement]),
    ImplantsModule,
    SurgeryModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
