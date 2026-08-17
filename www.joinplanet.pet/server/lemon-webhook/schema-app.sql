-- PLANET App schema (Phase 1) — additive, run after schema.sql
-- Business functions F1–F8 per docs/product/APP-DESIGN.md §1.2

CREATE TABLE IF NOT EXISTS users (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  email_hash   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,            -- sha256(token) hex
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_codes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,               -- sha256(email + ":" + code)
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes(email);

CREATE TABLE IF NOT EXISTS entitlements (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,              -- '*' = wildcard (founding, lifetime all)
  source      TEXT NOT NULL CHECK (source IN ('founding','pro_sub','pilot','manual')),
  source_ref  TEXT,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,                -- NULL = perpetual
  UNIQUE (user_id, feature_key, source)
);

CREATE TABLE IF NOT EXISTS circles (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'Asia/Singapore',
  invite_code TEXT NOT NULL UNIQUE,
  created_by  BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id BIGINT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner','caregiver')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE IF NOT EXISTS pets (
  id                   BIGSERIAL PRIMARY KEY,
  circle_id            BIGINT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  species              TEXT NOT NULL DEFAULT 'dog' CHECK (species IN ('dog','cat','other')),
  breed                TEXT NOT NULL DEFAULT '',
  birthday             DATE,
  allergies            JSONB NOT NULL DEFAULT '[]',
  conditions           JSONB NOT NULL DEFAULT '[]',
  medications_snapshot JSONB NOT NULL DEFAULT '[]',  -- DEPRECATED: use medications table; kept only as forward-compat placeholder
  emergency_contacts   JSONB NOT NULL DEFAULT '{"primary":null,"vet":null,"authorized_decision_maker":null}',
  notes                TEXT NOT NULL DEFAULT '',
  avatar_key           TEXT,
  created_by           BIGINT NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pets_circle_idx ON pets(circle_id);

-- Redundancy ledger R2 (APP-DESIGN §3.4): medications is normalized (lifecycle),
-- tasks carry both FKs because permission checks root at circle.
CREATE TABLE IF NOT EXISTS medications (
  id         BIGSERIAL PRIMARY KEY,
  pet_id     BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  dose       TEXT NOT NULL DEFAULT '',
  schedule   TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  started_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_on   DATE,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medications_pet_idx ON medications(pet_id);

CREATE TABLE IF NOT EXISTS care_tasks (
  id            BIGSERIAL PRIMARY KEY,
  circle_id     BIGINT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  pet_id        BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medication_id BIGINT REFERENCES medications(id) ON DELETE SET NULL,
  reminder      BOOLEAN NOT NULL DEFAULT FALSE,  -- local daily reminder opt-in (V1.5 wing 3, free tier)
  title         TEXT NOT NULL,
  time_of_day TIME NOT NULL DEFAULT '08:00',
  repeat      TEXT NOT NULL DEFAULT 'daily',
  note        TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_tasks_pet_idx ON care_tasks(pet_id) WHERE active;

CREATE TABLE IF NOT EXISTS task_logs (
  id         BIGSERIAL PRIMARY KEY,
  task_id    BIGINT NOT NULL REFERENCES care_tasks(id) ON DELETE CASCADE,
  log_date   DATE NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('done','skipped')),
  by_user_id BIGINT NOT NULL REFERENCES users(id),
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  note       TEXT NOT NULL DEFAULT '',
  UNIQUE (task_id, log_date)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id            BIGSERIAL PRIMARY KEY,
  pet_id        BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('symptom','weight','medication','vaccine','visit','note','photo')),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  severity      TEXT CHECK (severity IN ('mild','moderate','severe')),
  data          JSONB NOT NULL DEFAULT '{}',   -- structured payload (weight_kg, etc.)
  medication_id BIGINT REFERENCES medications(id) ON DELETE SET NULL,
  recorded_by   BIGINT NOT NULL REFERENCES users(id),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','system')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timeline_pet_occurred_idx ON timeline_events(pet_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id          BIGSERIAL PRIMARY KEY,
  pet_id      BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  event_id    BIGINT REFERENCES timeline_events(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image','pdf')),
  storage_key TEXT NOT NULL UNIQUE,
  filename    TEXT NOT NULL DEFAULT '',
  size        BIGINT NOT NULL DEFAULT 0,
  uploaded_by BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_event_idx ON attachments(event_id);
CREATE INDEX IF NOT EXISTS attachments_pet_idx ON attachments(pet_id);

CREATE TABLE IF NOT EXISTS share_links (
  id         BIGSERIAL PRIMARY KEY,
  pet_id     BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('summary','care')),
  token      TEXT NOT NULL UNIQUE,
  payload    JSONB NOT NULL DEFAULT '{}',  -- {reason, includes:{profile,allergies,medications,events,weight,visits}}
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  view_count INT NOT NULL DEFAULT 0        -- Redundancy ledger R3
);
CREATE INDEX IF NOT EXISTS shares_pet_idx ON share_links(pet_id);

CREATE TABLE IF NOT EXISTS digest_sends (
  circle_id BIGINT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  send_date DATE NOT NULL,
  PRIMARY KEY (circle_id, send_date)
);
