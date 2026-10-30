import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { PurchaseResult } from './sale.repository.js';
import type { SaleService } from './sale.service.js';
import {
  NoSaleResponse,
  PurchaseBody,
  PurchaseLookupResponse,
  PurchaseParams,
  PurchaseResponse,
  SaleStatusResponse,
} from './sale.schemas.js';

// The only place where business outcomes are translated into HTTP semantics.
const statusCodeFor: Record<PurchaseResult, 201 | 403 | 404 | 409 | 410> = {
  SUCCESS: 201,
  ALREADY_PURCHASED: 409,
  SOLD_OUT: 410,
  NOT_STARTED: 403,
  ENDED: 403,
  NO_SALE: 404,
};

export const saleRoutes: FastifyPluginAsyncTypebox<{ saleService: SaleService }> = async (
  app,
  { saleService },
) => {
  app.get(
    '/api/sale',
    { schema: { response: { 200: SaleStatusResponse, 404: NoSaleResponse } } },
    async (_req, reply) => {
      const status = await saleService.getStatus();
      return status ? status : reply.code(404).send({ error: 'NO_SALE' as const });
    },
  );

  app.post(
    '/api/purchases',
    {
      schema: {
        body: PurchaseBody,
        response: {
          201: PurchaseResponse,
          403: PurchaseResponse,
          404: PurchaseResponse,
          409: PurchaseResponse,
          410: PurchaseResponse,
        },
      },
    },
    async (req, reply) => {
      const result = await saleService.purchase(req.body.userId);
      return reply.code(statusCodeFor[result]).send({ result });
    },
  );

  app.get(
    '/api/purchases/:userId',
    { schema: { params: PurchaseParams, response: { 200: PurchaseLookupResponse } } },
    (req) => saleService.getPurchase(req.params.userId),
  );
};
