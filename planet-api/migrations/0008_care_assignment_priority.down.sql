DROP INDEX IF EXISTS public.ix_care_plan_assignments_order;
ALTER TABLE public.care_plan_assignments
    DROP CONSTRAINT IF EXISTS care_plan_assignments_priority_check;
ALTER TABLE public.care_plan_assignments
    DROP COLUMN IF EXISTS priority;
