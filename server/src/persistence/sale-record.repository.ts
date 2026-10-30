import type { Pool } from 'pg';
import type { Sale } from '../sale/sale.js';

/** The `sales` table: the durable definition of each sale. */
export function createSaleRecordRepository(pool: Pool) {
  return {
    async exists(id: string): Promise<boolean> {
      const { rowCount } = await pool.query('SELECT 1 FROM sales WHERE id = $1', [id]);
      return rowCount === 1;
    },

    /** Creates the sale, or replaces it together with its orders (ON DELETE CASCADE). */
    async replace(sale: Sale): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM sales WHERE id = $1', [sale.id]);
        await client.query('INSERT INTO sales (id, starts_at, ends_at, total_stock) VALUES ($1, $2, $3, $4)', [
          sale.id,
          sale.startsAt,
          sale.endsAt,
          sale.totalStock,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
