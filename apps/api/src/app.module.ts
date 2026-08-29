import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ApplicationModule } from './application/application.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { TreatmentsModule } from './modules/treatments/treatments.module';
import { ImplantsModule } from './modules/implants/implants.module';
import { OrthoModule } from './modules/ortho/ortho.module';
import { SurgeryModule } from './modules/surgery/surgery.module';
import { StatsModule } from './modules/stats/stats.module';
import { DataExchangeModule } from './modules/data-exchange/data-exchange.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { PasswordChangeGuard } from './modules/auth/guards/password-change.guard';
import { AllExceptionsFilter } from './presentation/http/filters/all-exceptions.filter';
import { HealthController } from './presentation/http/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../../../.env'), '.env'],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    ApplicationModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    TreatmentsModule,
    ImplantsModule,
    OrthoModule,
    SurgeryModule,
    StatsModule,
    DataExchangeModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate, then authorise, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
