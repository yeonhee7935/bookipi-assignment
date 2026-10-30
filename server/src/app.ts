import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { saleRoutes } from './sale/sale.routes.js';
import type { SaleService } from './sale/sale.service.js';

const RETRY_AFTER_SECONDS = 2;

interface AppDeps {
  saleService: SaleService;
  checkHealth: () => Promise<unknown>;
  logger?: FastifyServerOptions['logger'];
}

export function buildApp({ saleService, checkHealth, logger = false }: AppDeps) {
  const app = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler<FastifyError>((error, req, reply) => {
    if (error.statusCode !== undefined && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: 'BAD_REQUEST', message: error.message });
    }
    // Any unexpected failure (most likely Redis being unreachable) fails closed:
    // we never guess at stock, the client is told to retry. Retry-After spreads
    // retries out instead of every client hammering the moment Redis recovers.
    req.log.error(error);
    return reply
      .code(503)
      .header('Retry-After', String(RETRY_AFTER_SECONDS))
      .send({ error: 'SERVICE_UNAVAILABLE', message: 'Please retry shortly' });
  });

  app.get('/health', async () => {
    await checkHealth();
    return { ok: true };
  });

  app.register(saleRoutes, { saleService });
  return app;
}
