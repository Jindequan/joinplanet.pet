-- 值班交班是 Care Request 的聚合入口；具体照护事实仍然只存在于
-- care_occurrences，批次本身不能被执行或完成。
CREATE TABLE public.care_handoff_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE RESTRICT,
    from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    message text NOT NULL DEFAULT '',
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_handoff_batches_message_length CHECK (char_length(message) <= 1000),
    CONSTRAINT care_handoff_batches_distinct_users CHECK (from_user_id <> target_user_id),
    CONSTRAINT care_handoff_batches_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE public.care_requests
    ADD COLUMN batch_id uuid REFERENCES public.care_handoff_batches(id) ON DELETE RESTRICT;

CREATE INDEX ix_care_handoff_batches_target
    ON public.care_handoff_batches (target_user_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_care_handoff_batches_family
    ON public.care_handoff_batches (family_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_care_requests_batch
    ON public.care_requests (batch_id, created_at ASC)
    WHERE batch_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_care_handoff_batches_updated_at
    BEFORE UPDATE ON public.care_handoff_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
