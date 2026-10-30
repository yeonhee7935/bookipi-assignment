import { getSaleStatus } from './sale.js';
import type { SaleRepository } from './sale.repository.js';

export function createSaleService(repo: SaleRepository) {
  return {
    /** Returns null when no sale has been loaded into Redis. */
    async getStatus() {
      const snapshot = await repo.getSnapshot();
      if (!snapshot) return null;
      const { sale, remaining, now } = snapshot;
      return {
        status: getSaleStatus(sale, now, remaining),
        // Redis' clock, the same one purchases are judged by: clients run their
        // countdowns on it instead of a possibly skewed device clock.
        serverTime: now.toISOString(),
        startsAt: sale.startsAt.toISOString(),
        endsAt: sale.endsAt.toISOString(),
        totalStock: sale.totalStock,
        remaining,
      };
    },

    // Every rule (window, one per user, stock) is decided inside Redis in one atomic step.
    purchase: (userId: string) => repo.attemptPurchase(userId),

    async getPurchase(userId: string) {
      const purchasedAt = await repo.findPurchase(userId);
      return { purchased: purchasedAt !== null, purchasedAt: purchasedAt?.toISOString() ?? null };
    },
  };
}

export type SaleService = ReturnType<typeof createSaleService>;
