export interface AppConfig {
  port: number;
  logLevel: string;
  redisUrl: string;
  databaseUrl: string;
  /** Which sale this deployment serves. The sale itself (window, stock) lives in Postgres and Redis. */
  saleId: string;
}

type Env = Record<string, string | undefined>;

function parsePositiveInt(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    port: parsePositiveInt(env, 'PORT', 3000),
    logLevel: env.LOG_LEVEL ?? 'info',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    databaseUrl: env.DATABASE_URL ?? 'postgres://flashsale:flashsale@localhost:5432/flashsale',
    saleId: env.SALE_ID ?? 'launch',
  };
}
