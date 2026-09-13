DROP TRIGGER IF EXISTS trg_care_handoff_batches_updated_at ON public.care_handoff_batches;
DROP INDEX IF EXISTS public.ix_care_requests_batch;
DROP INDEX IF EXISTS public.ix_care_handoff_batches_family;
DROP INDEX IF EXISTS public.ix_care_handoff_batches_target;
ALTER TABLE public.care_requests DROP COLUMN IF EXISTS batch_id;
DROP TABLE IF EXISTS public.care_handoff_batches;
