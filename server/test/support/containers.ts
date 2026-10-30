import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import pg from 'pg';
import { createRedis } from '../../src/infra/redis.js';
import { migrate } from '../../src/migrate.js';

export async function startRedis(): Promise<StartedRedisContainer> {
  return new RedisContainer('redis:7.4-alpine').start();
}

export async function connectRedis(container: StartedRedisContainer, options = {}) {
  const redis = createRedis(container.getConnectionUrl(), options);
  await redis.connect();
  return redis;
}

/** Starts Postgres and applies the real migrations, exactly as deployments do. */
export async function startPostgres(): Promise<{ container: StartedPostgreSqlContainer; pool: pg.Pool }> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  await migrate(container.getConnectionUri());
  return { container, pool: new pg.Pool({ connectionString: container.getConnectionUri() }) };
}
