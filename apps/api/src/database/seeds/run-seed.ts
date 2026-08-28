import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { User } from '../../modules/users/user.entity';
import { TreatmentType } from '../../modules/treatments/treatment-type.entity';
import { UserRole } from '../../domain';
import { TREATMENT_TYPES } from './treatment-types.seed';

/**
 * Idempotent seed: the treatment catalogue and a first administrator account.
 * Safe to re-run — existing rows are updated in place, never duplicated.
 */
async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const treatments = dataSource.getRepository(TreatmentType);
    let created = 0;
    for (const seed of TREATMENT_TYPES) {
      const existing = await treatments.findOne({ where: { code: seed.code } });
      if (existing) {
        await treatments.update(existing.id, {
          nameFa: seed.nameFa,
          nameEn: seed.nameEn,
          icon: seed.icon,
          color: seed.color,
          sortOrder: seed.sortOrder,
        });
      } else {
        await treatments.save(treatments.create(seed));
        created++;
      }
    }
    console.log(
      `✓  Treatment catalogue: ${TREATMENT_TYPES.length} types (${created} new)`,
    );

    const users = dataSource.getRepository(User);
    const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
    const configuredPassword = process.env.SEED_ADMIN_PASSWORD;
    if (
      process.env.NODE_ENV === 'production' &&
      (!configuredPassword ||
        configuredPassword === 'ChangeMe!2026' ||
        configuredPassword.length < 12 ||
        /(?:change[-_ ]?me|insecure|example|default)/i.test(configuredPassword))
    ) {
      throw new Error(
        'SEED_ADMIN_PASSWORD must be a non-placeholder password of at least 12 characters when seeding production',
      );
    }
    const password = configuredPassword ?? 'ChangeMe!2026';
    const existingAdmin = await users.findOne({ where: { username } });

    if (existingAdmin) {
      console.log(`•  Admin "${username}" already exists — left untouched.`);
    } else {
      await users.save(
        users.create({
          username,
          passwordHash: await bcrypt.hash(password, 12),
          fullName: 'مدیر سیستم',
          role: UserRole.Admin,
          isActive: true,
          mustChangePassword: true,
        }),
      );
      console.log(`✓  Admin created — username: ${username}`);
      console.log(
        `   Password comes from SEED_ADMIN_PASSWORD. Change it after first login.`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('✗  Seed failed:', err);
  process.exit(1);
});
