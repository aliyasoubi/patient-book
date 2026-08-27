export interface AppConfig {
  env: string;
  port: number;
  corsOrigin: string[];
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
}

const csv = (v: string | undefined, fallback: string[]): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '3000', 10),
  corsOrigin: csv(process.env.CORS_ORIGIN, ['http://localhost:4200']),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'dental',
    password: process.env.DB_PASSWORD ?? 'dental_dev_pw',
    database: process.env.DB_NAME ?? 'patient_book',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'insecure-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'insecure-dev-refresh-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
});
