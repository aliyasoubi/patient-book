import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TreatmentType } from './treatment-type.entity';
import { ReferralSource } from './referral-source.entity';
import { PatientTreatment } from './patient-treatment.entity';
import { TreatmentsController } from './treatments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TreatmentType, ReferralSource, PatientTreatment])],
  controllers: [TreatmentsController],
})
export class TreatmentsModule {}
