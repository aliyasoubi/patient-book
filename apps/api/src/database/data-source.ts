import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'node:path';

loadEnv({ path: join(__dirname, '../../../../.env') });
loadEnv();

/**
 * Stand-alone DataSource for the TypeORM CLI (migrations, schema tooling).
 * The running app builds its own connection from `DatabaseModule`.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'dental',
  password: process.env.DB_PASSWORD ?? 'dental_dev_pw',
  database: process.env.DB_NAME ?? 'patient_book',
  entities: [join(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
