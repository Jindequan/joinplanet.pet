-- PLANET canonical schema baseline.
--
-- Data boundaries:
--   1. subjects and relationships: users, families, pets, memberships, ownership
--   2. rules: care_plans and care_rules
--   3. dynamic business records: care_occurrences and pet_events
--   4. infrastructure/audit: idempotency, outbox, auth, jobs, audit
--
-- Every PLANET-owned table has the same technical metadata contract:
--   created_at / updated_at / deleted_at
-- All instants use timestamptz. The application and database sessions use UTC.
-- Business lifecycle fields (ended_at, revoked_at, completed_at, etc.) remain
-- separate from deleted_at.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

SET TIME ZONE 'UTC';

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reject_immutable_row_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE FUNCTION public.guard_last_family_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  owner_count integer;
  family_deleted boolean;
BEGIN
  IF OLD.role <> 'owner' OR OLD.status <> 'active' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.role = 'owner'
     AND NEW.status = 'active'
     AND NEW.ended_at IS NULL
     AND NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT deleted_at IS NOT NULL
    INTO family_deleted
    FROM public.families
   WHERE id = OLD.family_id;

  IF COALESCE(family_deleted, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('family-owner:' || OLD.family_id::text));

  SELECT count(*)
    INTO owner_count
    FROM public.family_memberships
   WHERE family_id = OLD.family_id
     AND role = 'owner'
     AND status = 'active'
     AND ended_at IS NULL
     AND deleted_at IS NULL
     AND id <> OLD.id;

  IF owner_count = 0 THEN
    RAISE EXCEPTION 'family_must_keep_one_owner';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    display_name text NOT NULL DEFAULT '',
    locale text NOT NULL DEFAULT 'zh-CN',
    timezone text NOT NULL DEFAULT 'Asia/Shanghai',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT users_email_lower_check CHECK (email = lower(email)),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE TABLE public.user_preferences (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
    default_family_id uuid,
    default_pet_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.families (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'Asia/Shanghai',
    status text NOT NULL DEFAULT 'active',
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    deleted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT families_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    CONSTRAINT families_status_check CHECK (status IN ('active', 'deleted'))
);

CREATE TABLE public.family_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    joined_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    ended_reason text,
    invited_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    reminders_enabled boolean NOT NULL DEFAULT true,
    digest_enabled boolean NOT NULL DEFAULT true,
    alerts_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT family_memberships_role_check CHECK (role IN ('owner', 'caregiver')),
    CONSTRAINT family_memberships_status_check CHECK (status IN ('active', 'ended')),
    CONSTRAINT family_memberships_dates_check CHECK (ended_at IS NULL OR ended_at >= joined_at)
);

CREATE TABLE public.family_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    target_email text,
    role text NOT NULL DEFAULT 'caregiver',
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    accepted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT family_invitations_role_check CHECK (role IN ('owner', 'caregiver')),
    CONSTRAINT family_invitations_token_check CHECK (length(token_hash) >= 32),
    CONSTRAINT family_invitations_target_email_check CHECK (target_email IS NULL OR target_email = lower(target_email))
);

CREATE TABLE public.pets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    species text NOT NULL,
    breed text NOT NULL DEFAULT '',
    birth_date date,
    sex text NOT NULL DEFAULT '',
    neutered boolean NOT NULL DEFAULT false,
    weight_g integer,
    allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
    conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
    emergency_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
    med_decision_maker jsonb,
    notes text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    version integer NOT NULL DEFAULT 1,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT pets_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    CONSTRAINT pets_species_check CHECK (species IN ('dog', 'cat', 'other')),
    CONSTRAINT pets_sex_check CHECK (sex IN ('', 'male', 'female')),
    CONSTRAINT pets_weight_check CHECK (weight_g IS NULL OR weight_g > 0),
    CONSTRAINT pets_status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

CREATE TABLE public.pet_ownerships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    ownership_type text NOT NULL DEFAULT 'primary',
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to timestamptz,
    ended_reason text,
    source_transfer_id uuid,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT pet_ownerships_type_check CHECK (ownership_type = 'primary'),
    CONSTRAINT pet_ownerships_dates_check CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE public.family_pet_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    relationship_type text NOT NULL DEFAULT 'shared',
    linked_at timestamptz NOT NULL DEFAULT now(),
    unlinked_at timestamptz,
    unlinked_reason text,
    linked_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT family_pet_links_type_check CHECK (relationship_type IN ('primary', 'shared')),
    CONSTRAINT family_pet_links_dates_check CHECK (unlinked_at IS NULL OR unlinked_at > linked_at)
);

CREATE TABLE public.pet_user_delegations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    role text NOT NULL,
    capabilities text[] NOT NULL DEFAULT ARRAY['view']::text[],
    granted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT pet_user_delegations_role_check CHECK (role IN ('editor', 'viewer', 'read_only')),
    CONSTRAINT pet_user_delegations_capabilities_check CHECK (cardinality(capabilities) > 0)
);

CREATE TABLE public.pet_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    from_family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    to_family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    decided_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at timestamptz,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT pet_transfers_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    CONSTRAINT pet_transfers_family_check CHECK (from_family_id <> to_family_id),
    CONSTRAINT pet_transfers_decision_check CHECK ((status = 'pending' AND decided_at IS NULL) OR (status <> 'pending'))
);

CREATE TABLE public.medications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    name text NOT NULL,
    dose text NOT NULL DEFAULT '',
    instructions text NOT NULL DEFAULT '',
    started_on date NOT NULL DEFAULT CURRENT_DATE,
    ended_on date,
    note text NOT NULL DEFAULT '',
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT medications_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    CONSTRAINT medications_dates_check CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE public.care_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    medication_id uuid REFERENCES public.medications(id) ON DELETE RESTRICT,
    type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    start_date date NOT NULL DEFAULT CURRENT_DATE,
    end_date date,
    default_assignee_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_plans_type_check CHECK (type IN ('medication', 'feeding', 'health', 'grooming', 'exercise', 'custom')),
    CONSTRAINT care_plans_status_check CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    CONSTRAINT care_plans_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 120),
    CONSTRAINT care_plans_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE public.care_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE RESTRICT,
    frequency text NOT NULL,
    schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
    interval_days integer,
    weekdays smallint[],
    day_of_month smallint,
    local_time time without time zone,
    timezone text NOT NULL,
    dst_policy text NOT NULL DEFAULT 'shift_forward',
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_rules_frequency_check CHECK (frequency IN ('daily', 'weekly', 'monthly', 'interval', 'once')),
    CONSTRAINT care_rules_interval_check CHECK (interval_days IS NULL OR interval_days > 0),
    CONSTRAINT care_rules_weekdays_check CHECK (weekdays IS NULL OR cardinality(weekdays) BETWEEN 1 AND 7),
    CONSTRAINT care_rules_month_day_check CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
    CONSTRAINT care_rules_dst_check CHECK (dst_policy IN ('reject', 'shift_forward', 'shift_backward', 'first', 'second')),
    CONSTRAINT care_rules_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT care_rules_shape_check CHECK (
      (frequency = 'daily' AND weekdays IS NULL AND day_of_month IS NULL AND interval_days IS NULL)
      OR (frequency = 'weekly' AND weekdays IS NOT NULL AND day_of_month IS NULL AND interval_days IS NULL)
      OR (frequency = 'monthly' AND weekdays IS NULL AND day_of_month IS NOT NULL AND interval_days IS NULL)
      OR (frequency = 'interval' AND interval_days IS NOT NULL AND weekdays IS NULL AND day_of_month IS NULL)
      OR (frequency = 'once' AND interval_days IS NULL AND weekdays IS NULL AND day_of_month IS NULL)
    )
);

CREATE TABLE public.care_plan_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    role text NOT NULL DEFAULT 'helper',
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_plan_assignments_role_check CHECK (role IN ('owner', 'helper'))
);

CREATE TABLE public.care_occurrences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE RESTRICT,
    care_rule_id uuid NOT NULL REFERENCES public.care_rules(id) ON DELETE RESTRICT,
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    occurrence_key text NOT NULL,
    due_date date NOT NULL,
    due_at timestamptz NOT NULL,
    local_time time without time zone,
    timezone text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    assigned_to_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    completed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    note text NOT NULL DEFAULT '',
    rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    type_snapshot text NOT NULL DEFAULT '',
    title_snapshot text NOT NULL DEFAULT '',
    description_snapshot text NOT NULL DEFAULT '',
    frequency_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_occurrences_status_check CHECK (status IN ('pending', 'completed', 'skipped', 'missed', 'cancelled')),
    CONSTRAINT care_occurrences_completion_check CHECK ((status IN ('completed', 'skipped')) = (completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL))
);

CREATE TABLE public.pet_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    care_occurrence_id uuid REFERENCES public.care_occurrences(id) ON DELETE RESTRICT,
    medication_id uuid REFERENCES public.medications(id) ON DELETE RESTRICT,
    event_type text NOT NULL,
    occurred_at timestamptz NOT NULL,
    recorded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    source text NOT NULL DEFAULT 'user',
    source_key text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    edited_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    payload_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT pet_events_source_check CHECK (source IN ('user', 'care_occurrence', 'system') OR source LIKE 'auto:%'),
    CONSTRAINT pet_events_payload_version_check CHECK (payload_version > 0)
);

CREATE TABLE public.share_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    kind text NOT NULL,
    token_hash text NOT NULL,
    options jsonb NOT NULL DEFAULT '{}'::jsonb,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    view_count integer NOT NULL DEFAULT 0,
    last_viewed_at timestamptz,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT share_links_kind_check CHECK (kind IN ('care_card', 'summary')),
    CONSTRAINT share_links_view_count_check CHECK (view_count >= 0)
);

CREATE TABLE public.auth_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    purpose text NOT NULL DEFAULT 'sign_in',
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    created_ip inet,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT auth_challenges_purpose_check CHECK (purpose IN ('sign_in', 'verify_email', 'reset')),
    CONSTRAINT auth_challenges_attempts_check CHECK (attempts >= 0)
);

CREATE TABLE public.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    token_hash text NOT NULL,
    device_label text NOT NULL DEFAULT '',
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    scope_type text NOT NULL DEFAULT 'global',
    scope_id uuid,
    command_name text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    status text NOT NULL DEFAULT 'processing',
    resource_type text,
    resource_id uuid,
    response_status integer,
    response_body jsonb,
    lease_expires_at timestamptz,
    fencing_token bigint NOT NULL DEFAULT 1,
    completed_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT idempotency_keys_key_check CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
    CONSTRAINT idempotency_keys_hash_check CHECK (length(request_hash) = 64),
    CONSTRAINT idempotency_keys_status_check CHECK (status IN ('processing', 'succeeded', 'failed')),
    CONSTRAINT idempotency_keys_scope_check CHECK ((scope_type = 'global' AND scope_id IS NULL) OR (scope_type <> 'global' AND scope_id IS NOT NULL))
);

CREATE TABLE public.transactional_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    available_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT transactional_outbox_attempts_check CHECK (attempts >= 0)
);

CREATE TABLE public.audit_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    token text NOT NULL,
    platform text NOT NULL DEFAULT '',
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE public.job_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job text NOT NULL,
    family_id uuid REFERENCES public.families(id) ON DELETE CASCADE,
    dedupe_key text NOT NULL,
    status text NOT NULL DEFAULT 'running',
    attempts integer NOT NULL DEFAULT 1,
    available_at timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz,
    completed_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT job_runs_status_check CHECK (status IN ('running', 'succeeded', 'failed')),
    CONSTRAINT job_runs_attempts_check CHECK (attempts > 0)
);

CREATE TABLE public.auth_rate_limits (
    bucket text NOT NULL,
    rate_key text NOT NULL,
    window_start timestamptz NOT NULL,
    hit_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (bucket, rate_key, window_start),
    CONSTRAINT auth_rate_limits_count_check CHECK (hit_count >= 0)
);

CREATE TABLE public.plans (
    key text PRIMARY KEY,
    owned_families integer NOT NULL,
    members integer NOT NULL,
    active_pets integer NOT NULL,
    storage_bytes bigint NOT NULL,
    file_bytes bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT plans_limits_check CHECK (owned_families >= 0 AND members >= 0 AND active_pets >= 0 AND storage_bytes >= 0 AND file_bytes >= 0)
);

CREATE TABLE public.quota_configs (
    plan text NOT NULL REFERENCES public.plans(key) ON DELETE RESTRICT,
    resource text NOT NULL,
    quota_limit bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (plan, resource),
    CONSTRAINT quota_configs_limit_check CHECK (quota_limit >= 0),
    CONSTRAINT quota_configs_resource_check CHECK (resource IN ('pets_created', 'storage_bytes', 'ai_monthly'))
);

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    plan text NOT NULL REFERENCES public.plans(key) ON DELETE RESTRICT,
    status text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
    CONSTRAINT subscriptions_dates_check CHECK (expires_at IS NULL OR expires_at >= started_at)
);

CREATE TABLE public.entitlements (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    key text NOT NULL,
    source text NOT NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE public.user_usage (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    resource text NOT NULL,
    period text NOT NULL,
    used bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (user_id, resource, period),
    CONSTRAINT user_usage_used_check CHECK (used >= 0)
);

ALTER TABLE public.user_preferences
    ADD CONSTRAINT user_preferences_family_fkey
    FOREIGN KEY (default_family_id) REFERENCES public.families(id) ON DELETE SET NULL,
    ADD CONSTRAINT user_preferences_pet_fkey
    FOREIGN KEY (default_pet_id) REFERENCES public.pets(id) ON DELETE SET NULL;

ALTER TABLE public.pet_ownerships
    ADD CONSTRAINT pet_ownerships_source_transfer_fkey
    FOREIGN KEY (source_transfer_id) REFERENCES public.pet_transfers(id) ON DELETE SET NULL;

ALTER TABLE public.medications
    ADD CONSTRAINT medications_id_pet_key UNIQUE (id, pet_id);

ALTER TABLE public.care_plans
    ADD CONSTRAINT care_plans_id_pet_key UNIQUE (id, pet_id),
    ADD CONSTRAINT care_plans_medication_pet_fkey
    FOREIGN KEY (medication_id, pet_id) REFERENCES public.medications(id, pet_id) ON DELETE RESTRICT;

ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_id_plan_key UNIQUE (id, care_plan_id);

ALTER TABLE public.care_occurrences
    ADD CONSTRAINT care_occurrences_id_pet_key UNIQUE (id, pet_id),
    ADD CONSTRAINT care_occurrences_plan_pet_fkey
    FOREIGN KEY (care_plan_id, pet_id) REFERENCES public.care_plans(id, pet_id) ON DELETE RESTRICT,
    ADD CONSTRAINT care_occurrences_rule_plan_fkey
    FOREIGN KEY (care_rule_id, care_plan_id) REFERENCES public.care_rules(id, care_plan_id) ON DELETE RESTRICT;

ALTER TABLE public.pet_events
    ADD CONSTRAINT pet_events_occurrence_pet_fkey
    FOREIGN KEY (care_occurrence_id, pet_id) REFERENCES public.care_occurrences(id, pet_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_users_email ON public.users (lower(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_family_memberships_active ON public.family_memberships (family_id, user_id) WHERE status = 'active' AND ended_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_family_invitations_token ON public.family_invitations (token_hash) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_family_pet_links_active ON public.family_pet_links (family_id, pet_id) WHERE unlinked_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_family_pet_links_primary_pet ON public.family_pet_links (pet_id) WHERE relationship_type = 'primary' AND unlinked_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_pet_user_delegations_active ON public.pet_user_delegations (pet_id, user_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_pet_transfers_pending ON public.pet_transfers (pet_id) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_care_plan_assignments_active ON public.care_plan_assignments (care_plan_id, user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_share_links_token ON public.share_links (token_hash) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_sessions_token ON public.sessions (token_hash) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_push_tokens_token ON public.push_tokens (token);
CREATE UNIQUE INDEX uq_job_runs_dedupe ON public.job_runs (job, family_id, dedupe_key);
CREATE UNIQUE INDEX uq_idempotency_scope ON public.idempotency_keys (
    principal_user_id,
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    command_name,
    idempotency_key
) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_occurrence_source_event ON public.pet_events (care_occurrence_id) WHERE care_occurrence_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_care_occurrences_rule_date ON public.care_occurrences (care_rule_id, due_date) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_pet_events_source_key ON public.pet_events (pet_id, source, event_type, source_key)
    WHERE source_key IS NOT NULL AND source <> 'user' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_pet_primary_ownership_now ON public.pet_ownerships (pet_id) WHERE valid_to IS NULL AND deleted_at IS NULL;

ALTER TABLE public.pet_ownerships
    ADD CONSTRAINT pet_ownerships_no_overlap
    EXCLUDE USING gist (
        pet_id WITH =,
        tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') WITH &&
    ) WHERE (deleted_at IS NULL);

ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_no_overlap
    EXCLUDE USING gist (
        care_plan_id WITH =,
        daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (deleted_at IS NULL);

CREATE INDEX ix_family_memberships_user ON public.family_memberships (user_id) WHERE status = 'active' AND ended_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_family_pet_links_pet ON public.family_pet_links (pet_id) WHERE unlinked_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_pet_ownerships_owner ON public.pet_ownerships (owner_user_id) WHERE valid_to IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_pet_user_delegations_user ON public.pet_user_delegations (user_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_care_plans_pet_active ON public.care_plans (pet_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX ix_care_rules_plan_active ON public.care_rules (care_plan_id, effective_from DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_care_plan_assignments_user ON public.care_plan_assignments (user_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_care_occurrences_pending_due ON public.care_occurrences (due_at) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX ix_care_occurrences_pet_date ON public.care_occurrences (pet_id, due_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_pet_events_pet_time ON public.pet_events (pet_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_auth_challenges_pending ON public.auth_challenges (email, expires_at) WHERE consumed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_idempotency_expiry ON public.idempotency_keys (expires_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_outbox_ready ON public.transactional_outbox (available_at) WHERE published_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_job_runs_retry ON public.job_runs (status, available_at) WHERE status <> 'succeeded' AND deleted_at IS NULL;
CREATE INDEX ix_sessions_user_active ON public.sessions (user_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_share_links_active ON public.share_links (expires_at) WHERE revoked_at IS NULL AND deleted_at IS NULL;
CREATE INDEX ix_subscriptions_user_active ON public.subscriptions (user_id) WHERE status = 'active' AND deleted_at IS NULL;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_families_updated_at BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_family_memberships_updated_at BEFORE UPDATE ON public.family_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_family_invitations_updated_at BEFORE UPDATE ON public.family_invitations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pets_updated_at BEFORE UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pet_ownerships_updated_at BEFORE UPDATE ON public.pet_ownerships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_family_pet_links_updated_at BEFORE UPDATE ON public.family_pet_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pet_user_delegations_updated_at BEFORE UPDATE ON public.pet_user_delegations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pet_transfers_updated_at BEFORE UPDATE ON public.pet_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_medications_updated_at BEFORE UPDATE ON public.medications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_care_plans_updated_at BEFORE UPDATE ON public.care_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_care_rules_updated_at BEFORE UPDATE ON public.care_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_care_plan_assignments_updated_at BEFORE UPDATE ON public.care_plan_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_care_occurrences_updated_at BEFORE UPDATE ON public.care_occurrences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pet_events_updated_at BEFORE UPDATE ON public.pet_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_share_links_updated_at BEFORE UPDATE ON public.share_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_auth_challenges_updated_at BEFORE UPDATE ON public.auth_challenges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_idempotency_keys_updated_at BEFORE UPDATE ON public.idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_outbox_updated_at BEFORE UPDATE ON public.transactional_outbox FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_push_tokens_updated_at BEFORE UPDATE ON public.push_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_job_runs_updated_at BEFORE UPDATE ON public.job_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_auth_rate_limits_updated_at BEFORE UPDATE ON public.auth_rate_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_quota_configs_updated_at BEFORE UPDATE ON public.quota_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_entitlements_updated_at BEFORE UPDATE ON public.entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_usage_updated_at BEFORE UPDATE ON public.user_usage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_family_last_owner
BEFORE DELETE OR UPDATE ON public.family_memberships
FOR EACH ROW EXECUTE FUNCTION public.guard_last_family_owner();

CREATE TRIGGER trg_audit_records_append_only
BEFORE UPDATE OR DELETE ON public.audit_records
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_row_change();

INSERT INTO public.plans (key, owned_families, members, active_pets, storage_bytes, file_bytes)
VALUES
  ('free', 3, 2, 5, 52428800, 10485760),
  ('pro', 3, 6, 5, 10737418240, 52428800);

INSERT INTO public.quota_configs (plan, resource, quota_limit)
VALUES
  ('free', 'pets_created', 5),
  ('pro', 'pets_created', 5),
  ('free', 'storage_bytes', 52428800),
  ('pro', 'storage_bytes', 10737418240),
  ('free', 'ai_monthly', 20),
  ('pro', 'ai_monthly', 20);
