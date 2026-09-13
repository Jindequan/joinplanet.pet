ALTER TABLE public.care_request_events
    DROP CONSTRAINT care_request_events_action_check;

-- Rollback keeps the event rows readable on databases that already observed a
-- reassignment; the older schema has no equivalent action value.
UPDATE public.care_request_events SET action = 'delegated' WHERE action = 'reassigned';

ALTER TABLE public.care_request_events
    ADD CONSTRAINT care_request_events_action_check
    CHECK (action IN ('sent', 'seen', 'accepted', 'declined', 'delegated', 'expired', 'cancelled'));
