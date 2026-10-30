import { Type } from 'typebox';

export const UserId = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: '^[A-Za-z0-9._@+-]+$',
  description: 'Username or email',
});

export const SaleStatusResponse = Type.Object({
  status: Type.Union([
    Type.Literal('upcoming'),
    Type.Literal('active'),
    Type.Literal('sold_out'),
    Type.Literal('ended'),
  ]),
  serverTime: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.String(),
  totalStock: Type.Integer(),
  remaining: Type.Integer(),
});

export const PurchaseBody = Type.Object({ userId: UserId });

export const PurchaseResponse = Type.Object({
  result: Type.Union([
    Type.Literal('SUCCESS'),
    Type.Literal('ALREADY_PURCHASED'),
    Type.Literal('SOLD_OUT'),
    Type.Literal('NOT_STARTED'),
    Type.Literal('ENDED'),
    Type.Literal('NO_SALE'),
  ]),
});

export const NoSaleResponse = Type.Object({ error: Type.Literal('NO_SALE') });

export const PurchaseParams = Type.Object({ userId: UserId });

export const PurchaseLookupResponse = Type.Object({
  purchased: Type.Boolean(),
  purchasedAt: Type.Union([Type.String(), Type.Null()]),
});
