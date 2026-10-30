import type { StartedRedisContainer } from '@testcontainers/redis';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sale } from '../../src/sale/sale.js';
import { saleKeys } from '../../src/sale/sale.keys.js';
import { createSaleRepository, type PurchaseResult } from '../../src/sale/sale.repository.js';
import { connectRedis, startRedis } from '../support/containers.js';
import { makeSale } from '../support/fixtures.js';

// Several connections stand in for several API instances hitting the same Redis.
const CONNECTIONS = 8;
const HOUR = 60 * 60 * 1000;

let container: StartedRedisContainer;
let clients: Redis[];

beforeAll(async () => {
  container = await startRedis();
  clients = await Promise.all(Array.from({ length: CONNECTIONS }, () => connectRedis(container)));
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.quit()));
  await container.stop();
});

async function setupSale(overrides: Partial<Sale> = {}) {
  const sale = makeSale(overrides);
  const repos = clients.map((c) => createSaleRepository(c, sale.id));
  await repos[0].load(sale);
  return { sale, repos, keys: saleKeys(sale.id) };
}

function tally(results: PurchaseResult[]) {
  return results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
}

describe('purchase under concurrency', () => {
  it('never oversells: 2,000 distinct users compete for 100 units', async () => {
    const { repos, keys } = await setupSale({ totalStock: 100 });

    const results = await Promise.all(
      Array.from({ length: 2000 }, (_, i) => repos[i % CONNECTIONS].attemptPurchase(`user-${i}`)),
    );

    expect(tally(results)).toEqual({ SUCCESS: 100, SOLD_OUT: 1900 });
    const redis = clients[0];
    expect(await redis.get(keys.stock)).toBe('0');
    expect(await redis.hlen(keys.purchases)).toBe(100);
    expect(await redis.xlen(keys.events)).toBe(100);
  });

  it('allows one item per user: the same user fires 500 concurrent requests', async () => {
    const { repos, keys } = await setupSale({ totalStock: 100 });

    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) => repos[i % CONNECTIONS].attemptPurchase('greedy-user')),
    );

    expect(tally(results)).toEqual({ SUCCESS: 1, ALREADY_PURCHASED: 499 });
    expect(await clients[0].get(keys.stock)).toBe('99');
    expect(await clients[0].xlen(keys.events)).toBe(1);
  });

  it('keeps both rules with a mix of repeat and unique users', async () => {
    const { repos, keys } = await setupSale({ totalStock: 50 });
    // 200 users, each sending 5 requests in parallel
    const userIds = Array.from({ length: 1000 }, (_, i) => `user-${i % 200}`);

    const results = await Promise.all(userIds.map((id, i) => repos[i % CONNECTIONS].attemptPurchase(id)));

    expect(tally(results).SUCCESS).toBe(50);
    expect(new Set(await clients[0].hkeys(keys.purchases)).size).toBe(50);
    expect(await clients[0].get(keys.stock)).toBe('0');
  });
});

describe('sale window, judged on the Redis clock', () => {
  it('rejects purchases before the start without taking stock', async () => {
    const { repos } = await setupSale({ startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR) });

    expect(await repos[0].attemptPurchase('alice')).toBe('NOT_STARTED');
    expect((await repos[0].getSnapshot())?.remaining).toBe(10);
  });

  it('rejects purchases after the end, even from a previous buyer', async () => {
    const { repos } = await setupSale({ startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - 1) });

    expect(await repos[0].attemptPurchase('alice')).toBe('ENDED');
  });

  it('opens exactly at the start time', async () => {
    const { repos } = await setupSale({ startsAt: new Date(Date.now() + 300) });

    expect(await repos[0].attemptPurchase('early')).toBe('NOT_STARTED');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await repos[0].attemptPurchase('on-time')).toBe('SUCCESS');
  });

  it('records the purchase time from the Redis clock', async () => {
    const { repos } = await setupSale();
    const before = Date.now();

    await repos[0].attemptPurchase('alice');

    const purchasedAt = (await repos[0].findPurchase('alice'))!.getTime();
    expect(Math.abs(purchasedAt - before)).toBeLessThan(1000);
    expect(await repos[0].findPurchase('bob')).toBeNull();
  });

  it('answers NO_SALE when no sale has been loaded', async () => {
    const repo = createSaleRepository(clients[0], 'never-created');

    expect(await repo.attemptPurchase('alice')).toBe('NO_SALE');
    expect(await repo.getSnapshot()).toBeNull();
  });
});

describe('load', () => {
  it('replaces the previous state of the same sale', async () => {
    const { sale, repos, keys } = await setupSale({ totalStock: 5 });
    await repos[0].attemptPurchase('alice');

    await repos[0].load({ ...sale, totalStock: 7 });

    expect(await repos[0].findPurchase('alice')).toBeNull();
    expect(await clients[0].xlen(keys.events)).toBe(0);
    expect(await repos[0].getSnapshot()).toMatchObject({ remaining: 7, sale: { totalStock: 7 } });
  });
});
