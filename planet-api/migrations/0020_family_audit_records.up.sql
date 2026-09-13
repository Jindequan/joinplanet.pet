-- 0020: bring back the audit store now that Family governance has durable
-- writers and a read surface. Audit rows are append-only and are written in
-- the same transaction as the governance mutation.
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

CREATE INDEX ix_audit_records_resource_time
    ON public.audit_records (resource_type, resource_id, occurred_at DESC, id DESC);

CREATE INDEX ix_audit_records_actor_time
    ON public.audit_records (actor_user_id, occurred_at DESC);

CREATE TRIGGER trg_audit_records_append_only
BEFORE UPDATE OR DELETE ON public.audit_records
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_row_change();
