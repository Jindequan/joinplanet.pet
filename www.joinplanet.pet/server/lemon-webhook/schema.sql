-- PLANET membership ledger — PostgreSQL schema.
-- Apply once on a fresh database:  psql "$DATABASE_URL" -f schema.sql
-- Idempotent: safe to re-run (uses IF NOT EXISTS).

-- 1. Paid lifetime memberships and their claim state.
CREATE TABLE IF NOT EXISTS membership_claims (
  id              SERIAL PRIMARY KEY,
  order_id        TEXT NOT NULL,
  email           TEXT NOT NULL,
  email_hash      TEXT NOT NULL,
  sku             TEXT NOT NULL,
  plan            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('paid','claimed','refunded','over_limit','ignored')),
  paid_at         TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,
  claimed_user_id TEXT,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_claims_order_id_unique ON membership_claims (order_id);
CREATE INDEX IF NOT EXISTS membership_claims_email_hash_idx ON membership_claims (email_hash);
CREATE INDEX IF NOT EXISTS membership_claims_status_idx ON membership_claims (status);

-- 2. Raw Lemon Squeezy webhook events (idempotency / audit).
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id           SERIAL PRIMARY KEY,
  event_id     TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  processed    BOOLEAN NOT NULL DEFAULT FALSE,
  last_error   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_event_id_unique ON payment_webhook_events (event_id);

-- 3. Post-payment intake: email + one-line "what do you want first".
CREATE TABLE IF NOT EXISTS pet_intake (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  want       TEXT NOT NULL,
  order_id   TEXT,
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pet_intake_email_hash_idx ON pet_intake (email_hash);
CREATE INDEX IF NOT EXISTS pet_intake_source_idx ON pet_intake (source);

-- 4. Waitlist / hesitant-visitor email capture.
CREATE TABLE IF NOT EXISTS email_captures (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_captures_email_hash_unique ON email_captures (email_hash);
