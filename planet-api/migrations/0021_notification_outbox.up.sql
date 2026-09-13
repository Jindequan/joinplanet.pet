-- 0021: make direct care notifications durable.
-- A care request is authoritative in its own inbox, but the push/email side
-- effect must survive a provider outage or a short API restart.
CREATE TABLE public.notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    body text NOT NULL,
    kind text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    available_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    sent_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT notification_outbox_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX ix_notification_outbox_ready
    ON public.notification_outbox (available_at, created_at)
    WHERE sent_at IS NULL AND deleted_at IS NULL;

CREATE TRIGGER trg_notification_outbox_updated_at
    BEFORE UPDATE ON public.notification_outbox
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
