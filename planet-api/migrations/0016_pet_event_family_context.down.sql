DROP INDEX IF EXISTS public.ix_pet_events_family_time;
ALTER TABLE public.pet_events DROP COLUMN IF EXISTS family_id;
