import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InventoryItem } from './inventory-item.entity';
import { InventoryLot } from './inventory-lot.entity';
import { InventoryMovement } from './inventory-movement.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem, InventoryLot, InventoryMovement]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
