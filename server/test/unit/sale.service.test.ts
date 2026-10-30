import { describe, expect, it, vi } from 'vitest';
import type { SaleRepository } from '../../src/sale/sale.repository.js';
import { createSaleService } from '../../src/sale/sale.service.js';

const sale = {
  id: 'launch',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: new Date('2026-01-01T01:00:00Z'),
  totalStock: 10,
};
const NOW = new Date('2026-01-01T00:30:00Z');

function fakeRepo(overrides: Partial<SaleRepository> = {}): SaleRepository {
  return {
    load: vi.fn(),
    attemptPurchase: vi.fn().mockResolvedValue('SUCCESS'),
    getSnapshot: vi.fn().mockResolvedValue({ sale, remaining: 5, now: NOW }),
    findPurchase: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('SaleService.getStatus', () => {
  it('derives the status from the Redis snapshot and reports Redis time', async () => {
    expect(await createSaleService(fakeRepo()).getStatus()).toEqual({
      status: 'active',
      serverTime: NOW.toISOString(),
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-01T01:00:00.000Z',
      totalStock: 10,
      remaining: 5,
    });
  });

  it('returns null when no sale is loaded', async () => {
    const repo = fakeRepo({ getSnapshot: vi.fn().mockResolvedValue(null) });

    expect(await createSaleService(repo).getStatus()).toBeNull();
  });
});

describe('SaleService.purchase', () => {
  it.each(['SUCCESS', 'ALREADY_PURCHASED', 'SOLD_OUT', 'NOT_STARTED', 'ENDED', 'NO_SALE'] as const)(
    'returns the decision made in Redis: %s',
    async (outcome) => {
      const repo = fakeRepo({ attemptPurchase: vi.fn().mockResolvedValue(outcome) });

      expect(await createSaleService(repo).purchase('alice')).toBe(outcome);
      expect(repo.attemptPurchase).toHaveBeenCalledWith('alice');
    },
  );
});

describe('SaleService.getPurchase', () => {
  it('reports a purchase with its timestamp', async () => {
    const repo = fakeRepo({ findPurchase: vi.fn().mockResolvedValue(NOW) });

    expect(await createSaleService(repo).getPurchase('alice')).toEqual({ purchased: true, purchasedAt: NOW.toISOString() });
  });

  it('reports no purchase', async () => {
    expect(await createSaleService(fakeRepo()).getPurchase('bob')).toEqual({ purchased: false, purchasedAt: null });
  });
});
