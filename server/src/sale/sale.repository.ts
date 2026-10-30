import { readFileSync } from 'node:fs';
import type { Redis, Result } from 'ioredis';
import type { Sale } from './sale.js';
import { ORDER_CONSUMER_GROUP, saleKeys } from './sale.keys.js';

export type PurchaseResult = 'SUCCESS' | 'ALREADY_PURCHASED' | 'SOLD_OUT' | 'NOT_STARTED' | 'ENDED' | 'NO_SALE';

/** A consistent view of the sale, taken in one Redis transaction on Redis' clock. */
export interface SaleSnapshot {
  sale: Sale;
  remaining: number;
  now: Date;
}

declare module 'ioredis' {
  interface RedisCommander<Context> {
    attemptPurchase(
      metaKey: string,
      stockKey: string,
      purchasesKey: string,
      eventsKey: string,
      userId: string,
    ): Result<PurchaseResult, Context>;
  }
}

const purchaseScript = readFileSync(new URL('./purchase.lua', import.meta.url), 'utf8');

export function createSaleRepository(redis: Redis, saleId: string) {
  const keys = saleKeys(saleId);
  // defineCommand sends EVALSHA and falls back to EVAL when the script is not cached.
  redis.defineCommand('attemptPurchase', { numberOfKeys: 4, lua: purchaseScript });

  return {
    /**
     * Loads a sale into Redis, replacing any previous state of the same sale
     * (stock, purchases, pending events). Called by `create-sale`, never by the API.
     */
    async load(sale: Sale): Promise<void> {
      await redis
        .multi()
        .del(keys.meta, keys.stock, keys.purchases, keys.events)
        .hset(keys.meta, {
          startsAt: sale.startsAt.getTime(),
          endsAt: sale.endsAt.getTime(),
          totalStock: sale.totalStock,
        })
        .set(keys.stock, sale.totalStock)
        .xgroup('CREATE', keys.events, ORDER_CONSUMER_GROUP, '0', 'MKSTREAM')
        .exec();
    },

    attemptPurchase(userId: string): Promise<PurchaseResult> {
      return redis.attemptPurchase(keys.meta, keys.stock, keys.purchases, keys.events, userId);
    },

    async getSnapshot(): Promise<SaleSnapshot | null> {
      const results = await redis.multi().hmget(keys.meta, 'startsAt', 'endsAt', 'totalStock').get(keys.stock).time().exec();
      if (!results) throw new Error('Sale snapshot transaction was aborted');
      for (const [error] of results) if (error) throw error;

      const [startsAt, endsAt, totalStock] = results[0][1] as (string | null)[];
      if (startsAt === null || endsAt === null || totalStock === null) return null;
      const [seconds, micros] = results[2][1] as [string, string];

      return {
        sale: { id: saleId, startsAt: new Date(Number(startsAt)), endsAt: new Date(Number(endsAt)), totalStock: Number(totalStock) },
        remaining: Math.max(0, Number(results[1][1] ?? 0)),
        now: new Date(Number(seconds) * 1000 + Math.floor(Number(micros) / 1000)),
      };
    },

    async findPurchase(userId: string): Promise<Date | null> {
      const purchasedAt = await redis.hget(keys.purchases, userId);
      return purchasedAt === null ? null : new Date(Number(purchasedAt));
    },
  };
}

export type SaleRepository = ReturnType<typeof createSaleRepository>;
