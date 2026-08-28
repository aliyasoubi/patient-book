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
  auth: {
    refreshCookieName: string;
    refreshCookieMaxAgeMs: number;
  };
}

const csv = (v: string | undefined, fallback: string[]): string[] =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : fallback;

export const DEVELOPMENT_DEFAULTS = {
  databasePassword: 'dental_dev_pw',
  jwtSecret: 'insecure-dev-secret-change-me',
  refreshSecret: 'insecure-dev-refresh-change-me',
} as const;

const positiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const looksLikePlaceholder = (value: string): boolean =>
  /(?:change[-_ ]?me|insecure|example|default)/i.test(value);

const validateProduction = (config: AppConfig): void => {
  if (config.env !== 'production') return;

  const errors: string[] = [];
  if (
    config.jwt.secret === DEVELOPMENT_DEFAULTS.jwtSecret ||
    looksLikePlaceholder(config.jwt.secret) ||
    config.jwt.secret.length < 32
  ) {
    errors.push('JWT_SECRET must be a unique secret of at least 32 characters');
  }
  if (
    config.jwt.refreshSecret === DEVELOPMENT_DEFAULTS.refreshSecret ||
    looksLikePlaceholder(config.jwt.refreshSecret) ||
    config.jwt.refreshSecret.length < 32
  ) {
    errors.push(
      'JWT_REFRESH_SECRET must be a unique secret of at least 32 characters',
    );
  }
  if (config.jwt.secret === config.jwt.refreshSecret) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (
    config.db.password === DEVELOPMENT_DEFAULTS.databasePassword ||
    looksLikePlaceholder(config.db.password) ||
    config.db.password.length < 12
  ) {
    errors.push(
      'DB_PASSWORD must be changed from the development value and contain at least 12 characters',
    );
  }
  if (!config.corsOrigin.length) {
    errors.push('CORS_ORIGIN must contain at least one production frontend');
  }
  const insecureOrigins = config.corsOrigin.filter(
    (origin) => !origin.startsWith('https://'),
  );
  if (insecureOrigins.length) {
    errors.push(
      `CORS_ORIGIN must use HTTPS in production: ${insecureOrigins.join(', ')}`,
    );
  }

  if (errors.length) {
    throw new Error(
      `Unsafe production configuration:\n- ${errors.join('\n- ')}`,
    );
  }
};

export function buildConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const runtime = env.NODE_ENV ?? 'development';
  const config: AppConfig = {
    env: runtime,
    port: positiveInteger(env.API_PORT, 3000, 'API_PORT'),
    corsOrigin: csv(
      env.CORS_ORIGIN,
      runtime === 'production' ? [] : ['http://localhost:4200'],
    ),
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: positiveInteger(env.DB_PORT, 5432, 'DB_PORT'),
      username: env.DB_USER ?? 'dental',
      password: env.DB_PASSWORD ?? DEVELOPMENT_DEFAULTS.databasePassword,
      database: env.DB_NAME ?? 'patient_book',
    },
    jwt: {
      secret: env.JWT_SECRET ?? DEVELOPMENT_DEFAULTS.jwtSecret,
      expiresIn: env.JWT_EXPIRES_IN ?? '30m',
      refreshSecret:
        env.JWT_REFRESH_SECRET ?? DEVELOPMENT_DEFAULTS.refreshSecret,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
    auth: {
      refreshCookieName: env.REFRESH_COOKIE_NAME ?? 'pb.refresh',
      refreshCookieMaxAgeMs: positiveInteger(
        env.REFRESH_COOKIE_MAX_AGE_MS,
        7 * 24 * 60 * 60 * 1000,
        'REFRESH_COOKIE_MAX_AGE_MS',
      ),
    },
  };
  validateProduction(config);
  return config;
}

export default buildConfiguration;
