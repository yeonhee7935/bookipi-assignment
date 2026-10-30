import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createRedis } from './infra/redis.js';
import { createSaleRepository } from './sale/sale.repository.js';
import { createSaleService } from './sale/sale.service.js';

const config = loadConfig();
const redis = createRedis(config.redisUrl);
await redis.connect();

// The API never reads the sale definition from env or Postgres: every replica decides
// from the same Redis state and the same Redis clock.
const app = buildApp({
  saleService: createSaleService(createSaleRepository(redis, config.saleId)),
  checkHealth: () => redis.ping(),
  logger: { level: config.logLevel },
});
app.addHook('onClose', async () => {
  await redis.quit();
});

await app.listen({ host: '0.0.0.0', port: config.port });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    await app.close(); // stops accepting connections and lets in-flight requests finish
    process.exit(0);
  });
}
