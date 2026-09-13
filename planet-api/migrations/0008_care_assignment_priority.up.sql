-- Make fallback order explicit. Existing helpers keep their historical
-- creation order; future changes use priority rather than insertion timing.
ALTER TABLE public.care_plan_assignments
    ADD COLUMN priority integer NOT NULL DEFAULT 0;

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY care_plan_id, role
               ORDER BY created_at, id
           ) - 1 AS next_priority
    FROM public.care_plan_assignments
    WHERE deleted_at IS NULL
)
UPDATE public.care_plan_assignments a
SET priority = ranked.next_priority
FROM ranked
WHERE a.id = ranked.id;

ALTER TABLE public.care_plan_assignments
    ADD CONSTRAINT care_plan_assignments_priority_check CHECK (priority >= 0);

CREATE INDEX ix_care_plan_assignments_order
    ON public.care_plan_assignments (care_plan_id, role, priority, created_at, user_id)
    WHERE deleted_at IS NULL;
