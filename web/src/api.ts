export type SaleStatus = 'upcoming' | 'active' | 'sold_out' | 'ended';
export type PurchaseResult = 'SUCCESS' | 'ALREADY_PURCHASED' | 'SOLD_OUT' | 'NOT_STARTED' | 'ENDED' | 'NO_SALE';

export interface Sale {
  status: SaleStatus;
  serverTime: string;
  startsAt: string;
  endsAt: string;
  totalStock: number;
  remaining: number;
}

export interface PurchaseLookup {
  purchased: boolean;
  purchasedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Seconds the server asked us to wait (Retry-After), if any. */
    readonly retryAfter?: number,
  ) {
    super(`Request failed with status ${status}`);
  }
}

async function request<T>(url: string, init?: RequestInit, acceptStatuses: number[] = []): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(res.status, retryAfter);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSale: () => request<Sale>('/api/sale'),

  // Business outcomes come back as 4xx with a `result` body; those are answers, not errors.
  purchase: (userId: string) =>
    request<{ result: PurchaseResult }>(
      '/api/purchases',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) },
      [403, 404, 409, 410],
    ),

  getPurchase: (userId: string) => request<PurchaseLookup>(`/api/purchases/${encodeURIComponent(userId)}`),
};

export type Api = typeof api;
