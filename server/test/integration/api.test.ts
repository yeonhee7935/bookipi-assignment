import type { StartedRedisContainer } from '@testcontainers/redis';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { Sale } from '../../src/sale/sale.js';
import { createSaleRepository } from '../../src/sale/sale.repository.js';
import { createSaleService } from '../../src/sale/sale.service.js';
import { connectRedis, startRedis } from '../support/containers.js';
import { makeSale } from '../support/fixtures.js';

let container: StartedRedisContainer;
let redis: Redis;

beforeAll(async () => {
  container = await startRedis();
  redis = await connectRedis(container);
});

afterAll(async () => {
  await redis.quit();
  await container.stop();
});

async function appFor(overrides: Partial<Sale>) {
  const sale = makeSale(overrides);
  const repo = createSaleRepository(redis, sale.id);
  await repo.load(sale);
  return buildApp({ saleService: createSaleService(repo), checkHealth: () => redis.ping() });
}

const buy = (userId: string) => ({ method: 'POST' as const, url: '/api/purchases', payload: { userId } });

describe('flash sale API against real Redis', () => {
  it('walks through success, duplicate, lookup and sold out', async () => {
    const app = await appFor({ totalStock: 1 });

    expect((await app.inject(buy('alice'))).statusCode).toBe(201);
    expect((await app.inject(buy('alice'))).json()).toEqual({ result: 'ALREADY_PURCHASED' });
    expect((await app.inject({ method: 'GET', url: '/api/purchases/alice' })).json()).toMatchObject({ purchased: true });
    expect((await app.inject(buy('bob'))).json()).toEqual({ result: 'SOLD_OUT' });
    expect((await app.inject({ method: 'GET', url: '/api/purchases/bob' })).json()).toMatchObject({ purchased: false });
    expect((await app.inject({ method: 'GET', url: '/api/sale' })).json()).toMatchObject({ status: 'sold_out', remaining: 0 });
  });

  it('serves exactly `stock` successes to 1,000 concurrent HTTP requests', async () => {
    const app = await appFor({ totalStock: 25 });

    const responses = await Promise.all(Array.from({ length: 1000 }, (_, i) => app.inject(buy(`user-${i}`))));

    const codes = responses.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(25);
    expect(codes.filter((c) => c === 410)).toHaveLength(975);
  });

  it('reports an upcoming sale and rejects early purchases without consuming stock', async () => {
    const app = await appFor({ totalStock: 3, startsAt: new Date(Date.now() + 60_000) });

    expect((await app.inject(buy('alice'))).json()).toEqual({ result: 'NOT_STARTED' });
    const status = (await app.inject({ method: 'GET', url: '/api/sale' })).json();
    expect(status).toMatchObject({ status: 'upcoming', remaining: 3, totalStock: 3 });
    expect(Math.abs(Date.parse(status.serverTime) - Date.now())).toBeLessThan(1000);
  });

  it('answers 404 when the configured sale does not exist', async () => {
    const repo = createSaleRepository(redis, 'missing-sale');
    const app = buildApp({ saleService: createSaleService(repo), checkHealth: () => redis.ping() });

    expect((await app.inject({ method: 'GET', url: '/api/sale' })).statusCode).toBe(404);
    expect((await app.inject(buy('alice'))).json()).toEqual({ result: 'NO_SALE' });
  });

  it('fails closed with 503 when Redis is unreachable', async () => {
    const deadRedis = await connectRedis(container);
    const app = buildApp({
      saleService: createSaleService(createSaleRepository(deadRedis, makeSale().id)),
      checkHealth: () => deadRedis.ping(),
    });
    deadRedis.disconnect();

    expect((await app.inject(buy('alice'))).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/sale' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
  });
});
