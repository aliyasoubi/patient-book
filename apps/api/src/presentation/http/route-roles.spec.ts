import { describe, expect, it } from '@jest/globals';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';

/**
 * The roles guard lets a route with no `@Roles` through for anyone signed in,
 * which is right for reading and wrong for writing: a new POST that forgets
 * the decorator would be open to a viewer. Every controller file is read here,
 * so a new one is covered without being listed.
 */

/** Writes any signed-in user may make: their own password, nothing else. */
const OPEN_TO_EVERY_ROLE = new Set(['AuthController.changePassword']);

type Controller = { name: string; prototype: Record<string, unknown> };

const SRC = join(__dirname, '../..');

function controllers(): Controller[] {
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter(
    (file) => file.endsWith('.controller.ts'),
  );
  return files.flatMap((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(join(SRC, file)) as Record<string, unknown>;
    return Object.values(exported).filter(
      (value): value is Controller =>
        typeof value === 'function' &&
        Reflect.hasMetadata(PATH_METADATA, value),
    );
  });
}

function writesWithoutRoles(): string[] {
  const missing: string[] = [];
  for (const controller of controllers()) {
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      // By descriptor: reading a getter off the prototype would run it.
      const handler: unknown = Object.getOwnPropertyDescriptor(
        controller.prototype,
        name,
      )?.value;
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (method === undefined || method === RequestMethod.GET) continue;

      const marked = (key: string): boolean =>
        Boolean(
          Reflect.getMetadata(key, handler) ??
          Reflect.getMetadata(key, controller),
        );
      const route = `${controller.name}.${name}`;
      if (
        !marked(ROLES_KEY) &&
        !marked(IS_PUBLIC_KEY) &&
        !OPEN_TO_EVERY_ROLE.has(route)
      ) {
        missing.push(route);
      }
    }
  }
  return missing;
}

describe('route roles', () => {
  it('finds the controllers', () => {
    expect(controllers().length).toBeGreaterThan(5);
  });

  it('has no route that writes without naming the roles allowed to', () => {
    expect(writesWithoutRoles()).toEqual([]);
  });
});
