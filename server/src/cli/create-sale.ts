// Creates a sale: writes its definition to Postgres (source of record), then loads it
// into Redis, where purchases are decided. This is what an admin tool would call.
//
//   create-sale --stock 100 --starts-at 2026-12-01T09:00:00Z --ends-at 2026-12-01T10:00:00Z
//   create-sale --stock 100 --starts-in 30 --duration 600      (seconds from now)
//   add --replace to recreate an existing sale (its orders and Redis state are wiped)
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadConfig } from '../config.js';
import { createRedis } from '../infra/redis.js';
import { createSaleRecordRepository } from '../persistence/sale-record.repository.js';
import { validateSale, type Sale } from '../sale/sale.js';
import { createSaleRepository } from '../sale/sale.repository.js';

const config = loadConfig();
const { values: args } = parseArgs({
  options: {
    id: { type: 'string', default: config.saleId },
    stock: { type: 'string' },
    'starts-at': { type: 'string' },
    'ends-at': { type: 'string' },
    'starts-in': { type: 'string' },
    duration: { type: 'string' },
    replace: { type: 'boolean', default: false },
  },
});

function window(): Pick<Sale, 'startsAt' | 'endsAt'> {
  if (args['starts-at'] && args['ends-at']) {
    return { startsAt: new Date(args['starts-at']), endsAt: new Date(args['ends-at']) };
  }
  if (args['starts-in'] !== undefined && args.duration !== undefined) {
    const startsAt = Date.now() + Number(args['starts-in']) * 1000;
    return { startsAt: new Date(startsAt), endsAt: new Date(startsAt + Number(args.duration) * 1000) };
  }
  throw new Error('Give either --starts-at and --ends-at, or --starts-in and --duration');
}

const sale = validateSale({ id: args.id, totalStock: Number(args.stock), ...window() });

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const redis = createRedis(config.redisUrl);
await redis.connect();
try {
  const records = createSaleRecordRepository(pool);
  if ((await records.exists(sale.id)) && !args.replace) {
    throw new Error(`Sale "${sale.id}" already exists. Pass --replace to recreate it (deletes its orders).`);
  }
  await records.replace(sale);
  await createSaleRepository(redis, sale.id).load(sale);
  console.log(
    `sale "${sale.id}" created: ${sale.startsAt.toISOString()} -> ${sale.endsAt.toISOString()}, stock ${sale.totalStock}`,
  );
} finally {
  await Promise.all([redis.quit(), pool.end()]);
}
