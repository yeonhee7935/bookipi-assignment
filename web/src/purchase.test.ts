import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from './api';
import { attemptPurchase, checkPurchase } from './purchase';

function fakeApi(overrides: Partial<Api>): Api {
  return {
    getSale: vi.fn(),
    purchase: vi.fn(),
    getPurchase: vi.fn().mockResolvedValue({ purchased: false, purchasedAt: null }),
    ...overrides,
  };
}

describe('attemptPurchase', () => {
  it.each([
    ['SUCCESS', 'success', true],
    ['ALREADY_PURCHASED', 'info', true],
    ['SOLD_OUT', 'error', undefined],
    ['ENDED', 'error', undefined],
    ['NO_SALE', 'info', undefined],
  ] as const)('maps %s to a %s message (owned: %s)', async (result, tone, owned) => {
    const api = fakeApi({ purchase: vi.fn().mockResolvedValue({ result }) });

    const feedback = await attemptPurchase(api, 'alice');

    expect(feedback).toMatchObject({ tone });
    expect(feedback.owned).toBe(owned);
    expect(api.getPurchase).not.toHaveBeenCalled();
  });

  it('recovers a purchase whose response was lost', async () => {
    const api = fakeApi({
      purchase: vi.fn().mockRejectedValue(new ApiError(502)),
      getPurchase: vi.fn().mockResolvedValue({ purchased: true, purchasedAt: '2026-01-01T00:00:00Z' }),
    });

    const feedback = await attemptPurchase(api, 'alice');

    expect(feedback).toMatchObject({ tone: 'success', title: 'Seat confirmed', owned: true });
    // in the viewer's local time (tests run in New York)
    expect(feedback.detail?.replace(/\s/g, ' ')).toContain('at 7:00:00 pm GMT-5');
    expect(feedback.retryAfter).toBeUndefined();
  });

  it('asks the user to back off for the server-provided Retry-After when nothing was bought', async () => {
    const api = fakeApi({ purchase: vi.fn().mockRejectedValue(new ApiError(503, 5)) });

    const feedback = await attemptPurchase(api, 'alice');

    expect(feedback).toMatchObject({ tone: 'error', retryAfter: 5 });
    expect(feedback.owned).toBeUndefined();
  });

  it('falls back to a default back-off when the network fails and the lookup fails too', async () => {
    const api = fakeApi({
      purchase: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      getPurchase: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });

    expect(await attemptPurchase(api, 'alice')).toMatchObject({ tone: 'error', retryAfter: 2 });
  });

  it('does not look up or retry invalid input', async () => {
    const api = fakeApi({ purchase: vi.fn().mockRejectedValue(new ApiError(400)) });

    expect(await attemptPurchase(api, 'bad id')).toMatchObject({ title: 'Invalid user ID' });
    expect(api.getPurchase).not.toHaveBeenCalled();
  });
});

describe('checkPurchase', () => {
  it('reports when there is no order', async () => {
    expect(await checkPurchase(fakeApi({}), 'bob')).toMatchObject({ tone: 'info', owned: false });
  });

  it('marks the user as owning an item when an order exists', async () => {
    const api = fakeApi({ getPurchase: vi.fn().mockResolvedValue({ purchased: true, purchasedAt: null }) });

    expect(await checkPurchase(api, 'alice')).toMatchObject({ tone: 'success', owned: true });
  });
});
