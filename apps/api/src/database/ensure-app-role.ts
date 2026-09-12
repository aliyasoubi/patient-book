import { DataSource } from 'typeorm';

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`"${name}" is not a safe SQL identifier`);
  }
  return `"${name}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Provisions the least-privilege role the API connects as at runtime, kept
 * separate from the Postgres superuser that owns the schema and runs
 * migrations. Idempotent and run after every migration: an older deploy's
 * role stays in sync with new tables, and a rotated DB_APP_PASSWORD takes
 * effect on the next deploy without a manual ALTER ROLE.
 *
 * A no-op when DB_APP_USER is unset, so local dev (one superuser, no separate
 * app role) is unaffected.
 */
export async function ensureAppRole(dataSource: DataSource): Promise<void> {
  const user = process.env.DB_APP_USER;
  if (!user) return;

  const password = process.env.DB_APP_PASSWORD;
  if (!password) {
    throw new Error('DB_APP_USER is set but DB_APP_PASSWORD is not');
  }

  const role = quoteIdent(user);
  const pass = quoteLiteral(password);
  const database = quoteIdent(dataSource.options.database as string);

  const [{ exists }]: [{ exists: boolean }] = await dataSource.query(
    'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
    [user],
  );
  if (exists) {
    await dataSource.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${pass}`);
  } else {
    await dataSource.query(
      `CREATE ROLE ${role} WITH LOGIN PASSWORD ${pass} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
  }

  // DML only — no CREATE/DROP/ALTER. Schema changes stay on the migration
  // role, so a compromised API process cannot touch the schema, other
  // databases, or any other role.
  await dataSource.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  await dataSource.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await dataSource.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
  );
  await dataSource.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
  );
  // Covers tables/sequences a later migration adds, without editing this file.
  await dataSource.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
  );
  await dataSource.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
  );

  console.log(
    `✓  Runtime role ${user} is up to date (DML only, no schema privileges).`,
  );
}
