import 'reflect-metadata';
import dataSource from './data-source';
import { ensureAppRole } from './ensure-app-role';

/**
 * Migration runner. TypeORM 1.x's own CLI loads the DataSource file through a
 * dynamic import that breaks under ts-node's CommonJS hook, so the app drives
 * the migrations directly instead.
 */
async function main(): Promise<void> {
  const direction = process.argv[2] ?? 'run';
  await dataSource.initialize();
  try {
    if (direction === 'revert') {
      await dataSource.undoLastMigration({ transaction: 'all' });
      console.log('↩︎  Reverted the last migration.');
    } else {
      const applied = await dataSource.runMigrations({ transaction: 'all' });
      if (applied.length === 0) console.log('✓  Schema is already up to date.');
      else applied.forEach((m) => console.log(`✓  Applied ${m.name}`));
      await ensureAppRole(dataSource);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('✗  Migration failed:', err);
  process.exit(1);
});
