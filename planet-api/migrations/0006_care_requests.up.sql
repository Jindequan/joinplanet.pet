-- L3 照护协作：Care Request 附着在 Care Occurrence 上，不复制待办事实。
CREATE TABLE public.care_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE RESTRICT,
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    occurrence_id uuid NOT NULL REFERENCES public.care_occurrences(id) ON DELETE RESTRICT,
    from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    state text NOT NULL DEFAULT 'sent',
    message text NOT NULL DEFAULT '',
    supersedes_request_id uuid REFERENCES public.care_requests(id) ON DELETE RESTRICT,
    seen_at timestamptz,
    responded_at timestamptz,
    response_note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_requests_state_check CHECK (state IN ('sent', 'seen', 'accepted', 'declined', 'delegated', 'expired', 'cancelled')),
    CONSTRAINT care_requests_message_length CHECK (char_length(message) <= 1000),
    CONSTRAINT care_requests_response_note_length CHECK (char_length(response_note) <= 1000),
    CONSTRAINT care_requests_distinct_users CHECK (from_user_id <> target_user_id)
);

CREATE TABLE public.care_request_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.care_requests(id) ON DELETE RESTRICT,
    actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    action text NOT NULL,
    from_state text,
    to_state text NOT NULL,
    target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_request_events_action_check CHECK (action IN ('sent', 'seen', 'accepted', 'declined', 'delegated', 'reassigned', 'expired', 'cancelled')),
    CONSTRAINT care_request_events_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE public.care_requests
    ADD CONSTRAINT care_requests_occurrence_pet_fkey
    FOREIGN KEY (occurrence_id, pet_id) REFERENCES public.care_occurrences(id, pet_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_care_requests_one_open_per_occurrence
    ON public.care_requests (occurrence_id)
    WHERE state IN ('sent', 'seen') AND deleted_at IS NULL;
CREATE INDEX ix_care_requests_inbox
    ON public.care_requests (target_user_id, created_at DESC)
    WHERE state IN ('sent', 'seen') AND deleted_at IS NULL;
CREATE INDEX ix_care_requests_occurrence
    ON public.care_requests (occurrence_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_care_request_events_request
    ON public.care_request_events (request_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_care_requests_updated_at
    BEFORE UPDATE ON public.care_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_care_request_events_updated_at
    BEFORE UPDATE ON public.care_request_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
