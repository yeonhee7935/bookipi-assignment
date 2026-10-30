import { describe, expect, it } from 'vitest';
import { getSaleStatus, validateSale, type Sale } from '../../src/sale/sale.js';

const sale: Sale = {
  id: 'launch',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: new Date('2026-01-01T01:00:00Z'),
  totalStock: 10,
};
const DURING = new Date('2026-01-01T00:30:00Z');

describe('getSaleStatus', () => {
  it.each([
    ['upcoming', new Date('2025-12-31T23:59:59.999Z'), 10],
    ['active', sale.startsAt, 10],
    ['active', DURING, 1],
    ['sold_out', DURING, 0],
    ['ended', sale.endsAt, 10],
    ['ended', sale.endsAt, 0],
  ] as const)('is %s at %s with %i remaining', (expected, now, remaining) => {
    expect(getSaleStatus(sale, now, remaining)).toBe(expected);
  });
});

describe('validateSale', () => {
  it('accepts a valid sale', () => {
    expect(validateSale(sale)).toBe(sale);
  });

  it.each([
    ['an id with spaces', { id: 'my sale' }, /id/],
    ['an end before the start', { endsAt: new Date('2025-12-31T00:00:00Z') }, /end after/],
    ['an invalid date', { startsAt: new Date('nope') }, /dates/],
    ['zero stock', { totalStock: 0 }, /Stock/],
    ['fractional stock', { totalStock: 1.5 }, /Stock/],
  ])('rejects %s', (_, overrides, message) => {
    expect(() => validateSale({ ...sale, ...overrides })).toThrow(message);
  });
});
