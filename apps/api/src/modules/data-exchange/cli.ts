import 'reflect-metadata';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { userInfo } from 'node:os';

import { ToolsModule } from '../../tools.module';

/**
 * Shared bootstrap for the data-exchange terminal tools.
 *
 * Errors and warnings only: a tool's output is what the operator reads, and
 * Nest's per-module start-up lines would bury it.
 */
export async function createToolContext(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(ToolsModule, {
    logger: ['error', 'warn'],
  });
}

/**
 * Who ran the tool, for the audit trail. There is no signed-in user on the
 * terminal, so the OS account stands in — it is the account that already had
 * the database credentials.
 */
export function cliActor(): string {
  return `cli:${userInfo().username}`;
}

/** `--flag` and positional arguments, kept deliberately simple. */
export function parseArgs(argv: string[]): {
  flags: Set<string>;
  positional: string[];
} {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) flags.add(arg.slice(2));
    else positional.push(arg);
  }
  return { flags, positional };
}
