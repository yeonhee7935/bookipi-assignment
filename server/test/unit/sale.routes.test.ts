import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { SaleService } from '../../src/sale/sale.service.js';

function appWith(overrides: Partial<SaleService> = {}) {
  const saleService: SaleService = {
    getStatus: vi.fn().mockResolvedValue({
      status: 'active',
      serverTime: '2026-01-01T00:30:00.000Z',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-01T01:00:00.000Z',
      totalStock: 10,
      remaining: 3,
    }),
    purchase: vi.fn().mockResolvedValue('SUCCESS'),
    getPurchase: vi.fn().mockResolvedValue({ purchased: false, purchasedAt: null }),
    ...overrides,
  };
  return buildApp({ saleService, checkHealth: vi.fn().mockResolvedValue('PONG') });
}

describe('GET /api/sale', () => {
  it('returns the sale status', async () => {
    const res = await appWith().inject({ method: 'GET', url: '/api/sale' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'active', remaining: 3, totalStock: 10 });
  });

  it('returns 404 when no sale exists', async () => {
    const res = await appWith({ getStatus: vi.fn().mockResolvedValue(null) }).inject({ method: 'GET', url: '/api/sale' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'NO_SALE' });
  });
});

describe('POST /api/purchases', () => {
  it.each([
    ['SUCCESS', 201],
    ['ALREADY_PURCHASED', 409],
    ['SOLD_OUT', 410],
    ['NOT_STARTED', 403],
    ['ENDED', 403],
    ['NO_SALE', 404],
  ] as const)('maps %s to HTTP %i', async (result, statusCode) => {
    const app = appWith({ purchase: vi.fn().mockResolvedValue(result) });

    const res = await app.inject({ method: 'POST', url: '/api/purchases', payload: { userId: 'alice' } });

    expect(res.statusCode).toBe(statusCode);
    expect(res.json()).toEqual({ result });
  });

  it.each([{}, { userId: '' }, { userId: 'has space' }, { userId: 'x'.repeat(65) }, { userId: null }])(
    'rejects invalid body %j with 400',
    async (payload) => {
      const purchase = vi.fn();
      const res = await appWith({ purchase }).inject({ method: 'POST', url: '/api/purchases', payload });

      expect(res.statusCode).toBe(400);
      expect(purchase).not.toHaveBeenCalled();
    },
  );

  it('fails closed with 503 when the backing store errors', async () => {
    const app = appWith({ purchase: vi.fn().mockRejectedValue(new Error('Connection is closed.')) });

    const res = await app.inject({ method: 'POST', url: '/api/purchases', payload: { userId: 'alice' } });

    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('2');
    expect(res.json()).toMatchObject({ error: 'SERVICE_UNAVAILABLE' });
  });
});

describe('GET /api/purchases/:userId', () => {
  it('returns whether the user secured an item', async () => {
    const getPurchase = vi.fn().mockResolvedValue({ purchased: true, purchasedAt: '2026-01-01T00:30:00.000Z' });

    const res = await appWith({ getPurchase }).inject({ method: 'GET', url: '/api/purchases/alice%40example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ purchased: true, purchasedAt: '2026-01-01T00:30:00.000Z' });
    expect(getPurchase).toHaveBeenCalledWith('alice@example.com');
  });
});

describe('GET /health', () => {
  it('returns 503 when the dependency check fails', async () => {
    const app = buildApp({
      saleService: {} as SaleService,
      checkHealth: vi.fn().mockRejectedValue(new Error('down')),
    });

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
  });
});
