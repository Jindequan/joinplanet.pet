ALTER TABLE public.care_request_events
    DROP CONSTRAINT care_request_events_action_check;

ALTER TABLE public.care_request_events
    ADD CONSTRAINT care_request_events_action_check
    CHECK (action IN ('sent', 'seen', 'accepted', 'declined', 'delegated', 'reassigned', 'expired', 'cancelled'));
