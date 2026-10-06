CREATE TABLE IF NOT EXISTS finance_documents (
  user_id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision > 0),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((data->>'revision')::bigint = revision),
  CHECK ((data->>'version')::integer = 3)
);
