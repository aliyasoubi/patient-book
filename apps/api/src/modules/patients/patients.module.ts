import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Patient } from './patient.entity';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { TreatmentType } from '../treatments/treatment-type.entity';
import { PatientTreatment } from '../treatments/patient-treatment.entity';
import { ReferralSource } from '../treatments/referral-source.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, TreatmentType, PatientTreatment, ReferralSource]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
