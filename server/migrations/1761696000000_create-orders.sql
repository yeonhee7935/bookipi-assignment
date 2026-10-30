-- Up Migration

-- One row per successful purchase. The primary key is the last line of defense
-- for "one item per user": even a duplicated event cannot create a second order.
CREATE TABLE orders (
  sale_id      TEXT        NOT NULL,
  user_id      TEXT        NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL,
  persisted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sale_id, user_id)
);

-- Down Migration

DROP TABLE orders;
