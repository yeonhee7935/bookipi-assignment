// Redis layout of one sale. The {saleId} hash tag keeps every key of a sale in the
// same Redis Cluster slot, which multi-key Lua scripts and transactions require.
export function saleKeys(saleId: string) {
  const prefix = `sale:{${saleId}}`;
  return {
    meta: `${prefix}:meta`, // hash: startsAt, endsAt (epoch ms), totalStock
    stock: `${prefix}:stock`, // remaining units
    purchases: `${prefix}:purchases`, // hash: userId -> purchasedAt (epoch ms)
    events: `${prefix}:events`, // stream consumed by the order worker
  };
}

export const ORDER_CONSUMER_GROUP = 'order-persisters';
