-- 0005 down：完整重建被删除的架构面（CI 的 up→down→up 链需要可逆）。
ALTER TABLE public.pet_handoffs ADD COLUMN ends_at timestamptz;

ALTER TABLE public.care_rules
    ADD COLUMN dst_policy text NOT NULL DEFAULT 'shift_forward';
ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_dst_check
    CHECK (dst_policy IN ('reject', 'shift_forward', 'shift_backward', 'first', 'second'));

ALTER TABLE public.idempotency_keys
    ADD COLUMN lease_expires_at timestamptz,
    ADD COLUMN fencing_token bigint NOT NULL DEFAULT 1,
    ADD COLUMN response_status integer;

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
CREATE INDEX ix_outbox_ready ON public.transactional_outbox (available_at) WHERE published_at IS NULL AND deleted_at IS NULL;
CREATE TRIGGER trg_outbox_updated_at
    BEFORE UPDATE ON public.transactional_outbox
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
CREATE TRIGGER trg_audit_records_append_only
    BEFORE UPDATE OR DELETE ON public.audit_records
    FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_row_change();
