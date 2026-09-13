DROP INDEX IF EXISTS public.ix_care_plans_family_active;
ALTER TABLE public.care_plans DROP COLUMN IF EXISTS family_id;
