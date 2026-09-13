-- An occurrence can be cancelled by a lifecycle/schedule operation that
-- predates request closure. Open cards must never survive the occurrence that
-- gave them meaning.
UPDATE public.care_requests r
SET state = 'cancelled',
    responded_at = COALESCE(r.responded_at, now()),
    response_note = COALESCE(NULLIF(r.response_note, ''), '照护事项已结束')
FROM public.care_occurrences co
WHERE co.id = r.occurrence_id
  AND co.status IN ('cancelled', 'completed', 'skipped')
  AND r.state IN ('sent', 'seen')
  AND r.deleted_at IS NULL;
