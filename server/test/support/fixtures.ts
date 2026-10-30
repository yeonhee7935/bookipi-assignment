import { randomUUID } from 'node:crypto';
import type { Sale } from '../../src/sale/sale.js';

const HOUR = 60 * 60 * 1000;

/** A sale that is open right now (on the real clock, which Redis also uses). */
export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: `test-${randomUUID()}`,
    startsAt: new Date(Date.now() - HOUR),
    endsAt: new Date(Date.now() + HOUR),
    totalStock: 10,
    ...overrides,
  };
}
