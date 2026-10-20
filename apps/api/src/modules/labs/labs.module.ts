import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Lab } from './lab.entity';
import { LabCase } from './lab-case.entity';
import { LabCaseTooth } from './lab-case-tooth.entity';
import { LabTrip } from './lab-trip.entity';
import { LabsController } from './labs.controller';
import { LabCasesController } from './lab-cases.controller';
import { LabCasesService } from './lab-cases.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lab, LabCase, LabCaseTooth, LabTrip])],
  controllers: [LabsController, LabCasesController],
  providers: [LabCasesService],
})
export class LabsModule {}
