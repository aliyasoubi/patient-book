import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Tariff } from './tariff.entity';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tariff])],
  controllers: [TariffsController],
  providers: [TariffsService],
})
export class TariffsModule {}
