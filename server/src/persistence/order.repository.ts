import type { Pool } from 'pg';

export interface OrderEvent {
  userId: string;
  purchasedAt: number;
}

export function createOrderRepository(pool: Pool, saleId: string) {
  return {
    /** Idempotent: re-delivered events hit the primary key and are ignored. */
    async insertMany(events: OrderEvent[]): Promise<void> {
      await pool.query(
        `INSERT INTO orders (sale_id, user_id, purchased_at)
         SELECT $1, e.user_id, to_timestamp(e.purchased_at / 1000.0)
         FROM unnest($2::text[], $3::bigint[]) AS e(user_id, purchased_at)
         ON CONFLICT (sale_id, user_id) DO NOTHING`,
        [saleId, events.map((e) => e.userId), events.map((e) => e.purchasedAt)],
      );
    },

    async count(): Promise<number> {
      const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM orders WHERE sale_id = $1', [saleId]);
      return Number(rows[0].count);
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
