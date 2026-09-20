import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import type { AppConfig } from '../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<AppConfig['db']>('db')!;
        const clinic = config.get<AppConfig['clinic']>('clinic')!;
        return {
          type: 'postgres' as const,
          ...db,
          entities: [join(__dirname, '../**/*.entity.{ts,js}')],
          migrations: [join(__dirname, 'migrations/*.{ts,js}')],
          // Schema changes always go through a reviewed migration, never an
          // implicit sync — this database holds the only copy of the records.
          synchronize: false,
          migrationsRun: false,
          logging:
            process.env.DB_LOGGING === 'true' ? 'all' : ['error', 'warn'],
          extra: {
            max: 20,
            // Sent at session start, so `now() - interval '6 months'` against
            // a date column and `age(birthDate)` count days on the clinic's
            // calendar rather than the container's — see `clinic.timezone`.
            options: `-c timezone=${clinic.timezone}`,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
