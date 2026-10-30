export interface Sale {
  id: string;
  startsAt: Date;
  endsAt: Date;
  totalStock: number;
}

export type SaleStatus = 'upcoming' | 'active' | 'sold_out' | 'ended';

export function getSaleStatus(sale: Sale, now: Date, remaining: number): SaleStatus {
  if (now < sale.startsAt) return 'upcoming';
  if (now >= sale.endsAt) return 'ended';
  return remaining > 0 ? 'active' : 'sold_out';
}

export function validateSale(sale: Sale): Sale {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sale.id)) throw new Error('Sale id must be 1-64 characters of [A-Za-z0-9_-]');
  if (Number.isNaN(sale.startsAt.getTime()) || Number.isNaN(sale.endsAt.getTime())) throw new Error('Invalid sale dates');
  if (sale.endsAt <= sale.startsAt) throw new Error('Sale must end after it starts');
  if (!Number.isInteger(sale.totalStock) || sale.totalStock <= 0) throw new Error('Stock must be a positive integer');
  return sale;
}
