-- Older auto-care timeline facts carried care_task_id in their payload but
-- were written before pet_events.care_occurrence_id was populated. Recover
-- the exact occurrence only when both the occurrence id and pet edge match.
UPDATE public.pet_events AS event
SET care_occurrence_id = occurrence.id
FROM public.care_occurrences AS occurrence
WHERE event.care_occurrence_id IS NULL
  AND event.source = 'auto:care'
  AND event.event_type IN ('care_task_completed', 'care_task_undone')
  AND event.payload->>'care_task_id' = occurrence.id::text
  AND event.pet_id = occurrence.pet_id;
