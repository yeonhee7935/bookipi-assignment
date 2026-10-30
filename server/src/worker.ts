import { hostname } from 'node:os';
import pg from 'pg';
import { loadConfig } from './config.js';
import { createRedis } from './infra/redis.js';
import { createOrderRepository } from './persistence/order.repository.js';
import { createOrderWorker } from './persistence/order.worker.js';

const config = loadConfig();
// Blocking reads hold the connection, so this client has no command timeout.
const redis = createRedis(config.redisUrl, { commandTimeout: undefined, enableOfflineQueue: true });
await redis.connect();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });

const worker = createOrderWorker({
  redis,
  orders: createOrderRepository(pool, config.saleId),
  saleId: config.saleId,
  // Stable across container restarts, so a restarted worker resumes its own pending entries.
  consumer: hostname(),
});

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort());
}

console.log(`order worker started (sale=${config.saleId}, consumer=${hostname()})`);
await worker.run(controller.signal); // finishes the in-flight batch before returning
await Promise.all([redis.quit(), pool.end()]);
