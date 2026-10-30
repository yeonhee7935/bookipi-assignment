import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrderRepository, type OrderRepository } from '../../src/persistence/order.repository.js';
import { createOrderWorker } from '../../src/persistence/order.worker.js';
import { createSaleRecordRepository } from '../../src/persistence/sale-record.repository.js';
import { ORDER_CONSUMER_GROUP, saleKeys } from '../../src/sale/sale.keys.js';
import { createSaleRepository } from '../../src/sale/sale.repository.js';
import { connectRedis, startPostgres, startRedis } from '../support/containers.js';
import { makeSale } from '../support/fixtures.js';

let redisContainer: StartedRedisContainer;
let pgContainer: StartedPostgreSqlContainer;
let redis: Redis;
let pool: pg.Pool;

beforeAll(async () => {
  [redisContainer, { container: pgContainer, pool }] = await Promise.all([startRedis(), startPostgres()]);
  redis = await connectRedis(redisContainer, { commandTimeout: undefined });
});

afterAll(async () => {
  await redis.quit();
  await pool.end();
  await Promise.all([redisContainer.stop(), pgContainer.stop()]);
});

// Mirrors `create-sale`: the definition goes to Postgres, the working copy to Redis.
async function saleWithPurchases(count: number) {
  const sale = makeSale({ totalStock: count });
  await createSaleRecordRepository(pool).replace(sale);
  const repo = createSaleRepository(redis, sale.id);
  await repo.load(sale);
  await Promise.all(Array.from({ length: count }, (_, i) => repo.attemptPurchase(`user-${i}`)));
  return { sale, orders: createOrderRepository(pool, sale.id) };
}

function workerFor(saleId: string, orders: OrderRepository, consumer = 'worker-a', claimIdleMs = 30_000) {
  return createOrderWorker({ redis, orders, saleId, consumer, batchSize: 50, blockMs: 10, claimIdleMs });
}

async function drain(worker: ReturnType<typeof workerFor>) {
  while ((await worker.processBatch()) > 0);
}

describe('order worker', () => {
  it('persists every reservation exactly once and acknowledges it', async () => {
    const { sale, orders } = await saleWithPurchases(120);
    const worker = workerFor(sale.id, orders);
    await worker.ensureGroup();

    await drain(worker);

    expect(await orders.count()).toBe(120);
    const pending = (await redis.xpending(saleKeys(sale.id).events, ORDER_CONSUMER_GROUP)) as [number];
    expect(pending[0]).toBe(0);
  });

  it('is idempotent when the same events are delivered twice', async () => {
    const sale = makeSale();
    await createSaleRecordRepository(pool).replace(sale);
    const orders = createOrderRepository(pool, sale.id);
    const events = [{ userId: 'dup', purchasedAt: Date.now() }];

    await orders.insertMany(events);
    await orders.insertMany(events);

    expect(await orders.count()).toBe(1);
  });

  it('retries its own pending entries after a database failure', async () => {
    const { sale, orders } = await saleWithPurchases(10);
    let failNext = true;
    const flaky: OrderRepository = {
      ...orders,
      insertMany: async (events) => {
        if (failNext) {
          failNext = false;
          throw new Error('db down');
        }
        return orders.insertMany(events);
      },
    };
    const worker = workerFor(sale.id, flaky);
    await worker.ensureGroup();

    await expect(worker.processBatch()).rejects.toThrow('db down');
    await drain(worker);

    expect(await orders.count()).toBe(10);
  });

  it('takes over entries left pending by a crashed worker', async () => {
    const { sale, orders } = await saleWithPurchases(10);
    const crashing: OrderRepository = { ...orders, insertMany: async () => Promise.reject(new Error('crash')) };
    const dead = workerFor(sale.id, crashing, 'worker-dead');
    await dead.ensureGroup();
    await expect(dead.processBatch()).rejects.toThrow('crash'); // entries now pending on worker-dead

    const survivor = workerFor(sale.id, orders, 'worker-b', 0);
    await drain(survivor);

    expect(await orders.count()).toBe(10);
  });
});

describe('sales table', () => {
  it('rejects orders for a sale that does not exist', async () => {
    const orders = createOrderRepository(pool, 'no-such-sale');

    await expect(orders.insertMany([{ userId: 'alice', purchasedAt: Date.now() }])).rejects.toThrow(/foreign key/);
  });

  it('replacing a sale removes its previous orders', async () => {
    const { sale, orders } = await saleWithPurchases(3);
    const worker = workerFor(sale.id, orders);
    await worker.ensureGroup();
    await drain(worker);
    expect(await orders.count()).toBe(3);

    const records = createSaleRecordRepository(pool);
    expect(await records.exists(sale.id)).toBe(true);
    await records.replace({ ...sale, totalStock: 5 });

    expect(await orders.count()).toBe(0);
    const { rows } = await pool.query('SELECT total_stock FROM sales WHERE id = $1', [sale.id]);
    expect(rows[0].total_stock).toBe(5);
  });
});
