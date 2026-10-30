import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applies pending migrations. Safe to run concurrently: an advisory lock serializes runners. */
export async function migrate(databaseUrl: string, log: (msg: string) => void = () => {}) {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    advisoryLockMode: 'wait',
    log,
  });
}
