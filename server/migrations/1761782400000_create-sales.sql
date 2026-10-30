-- Up Migration

-- The source of record for what is sold, when, and how many. Redis holds a working
-- copy while the sale runs (loaded by `create-sale`); this table is never on the hot path.
CREATE TABLE sales (
  id          TEXT        PRIMARY KEY,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  total_stock INTEGER     NOT NULL CHECK (total_stock > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE orders
  ADD CONSTRAINT orders_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE orders DROP CONSTRAINT orders_sale_id_fkey;
DROP TABLE sales;
