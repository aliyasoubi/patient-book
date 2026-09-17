import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ApplicationModule } from './application/application.module';
import { DataExchangeModule } from './modules/data-exchange/data-exchange.module';

/**
 * The application context the terminal tools run in: the same configuration,
 * database connection and audit service as the API, and the data-exchange use
 * cases — but no HTTP layer, no controllers, no guards. `run-export` and
 * `run-reconcile` bootstrap this instead of `AppModule`, so a tool can be run
 * on the server without also standing up a second copy of the web API.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../../../.env'), '.env'],
    }),
    DatabaseModule,
    ApplicationModule,
    DataExchangeModule,
  ],
})
export class ToolsModule {}
