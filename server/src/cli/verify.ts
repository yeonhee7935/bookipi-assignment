// Checks the system's final state after a stress run. Exits non-zero if any invariant is broken.
//   usage: verify [k6-summary.json]
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { loadConfig } from '../config.js';
import { createRedis } from '../infra/redis.js';
import { createOrderRepository } from '../persistence/order.repository.js';
import { saleKeys } from '../sale/sale.keys.js';

const { redisUrl, databaseUrl, saleId } = loadConfig();
const redis = createRedis(redisUrl);
await redis.connect();
const pool = new pg.Pool({ connectionString: databaseUrl });
const orders = createOrderRepository(pool, saleId);
const keys = saleKeys(saleId);
const totalStock = Number(await redis.hget(keys.meta, 'totalStock'));

// The worker persists asynchronously; wait for it to drain the stream.
async function waitForPersistence(expected: number, timeoutMs = 120_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = await orders.count();
  let lastReport = Date.now();
  while (count < expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    count = await orders.count();
    if (Date.now() - lastReport >= 5_000) {
      // stderr, so verify.txt keeps only the results
      console.error(`      waiting for persistence: ${count.toLocaleString('en')} / ${expected.toLocaleString('en')} orders`);
      lastReport = Date.now();
    }
  }
  return count;
}

const stock = Number(await redis.get(keys.stock));
const purchases = await redis.hlen(keys.purchases);
const backlog = purchases - (await orders.count());
const drainStart = Date.now();
const persisted = await waitForPersistence(purchases);
const drainSeconds = (Date.now() - drainStart) / 1000;
const k6Successes = process.argv[2]
  ? (JSON.parse(readFileSync(process.argv[2], 'utf8')).metrics.purchase_success?.values.count ?? 0)
  : undefined;

const checks: [string, boolean, string][] = [
  ['stock never negative', stock >= 0, `stock=${stock}`],
  ['sold = initial stock - remaining', purchases === totalStock - stock, `purchases=${purchases}, initial=${totalStock}, remaining=${stock}`],
  ['no oversell', purchases <= totalStock, `purchases=${purchases} <= ${totalStock}`],
  ['every reservation persisted to Postgres', persisted === purchases, `orders=${persisted}, purchases=${purchases}`],
];
if (k6Successes !== undefined) {
  // A reservation whose response was lost (e.g. the API replica died after Redis committed)
  // is still valid: the user sees it via GET /api/purchases/:userId. The reverse would be a bug.
  checks.push([
    'every HTTP 201 backed by a reservation',
    k6Successes <= purchases,
    `k6 successes=${k6Successes}, purchases=${purchases}, responses lost in transit=${purchases - k6Successes}`,
  ]);
}

for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(40)} ${detail}`);
console.log(`INFO  persistence backlog when load stopped: ${backlog} orders, drained in ${drainSeconds.toFixed(1)} s`);
await Promise.all([redis.quit(), pool.end()]);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
