-- A care occurrence can have more than one immutable timeline fact: the
-- original completion/skip and a later undo (and, after that, another
-- completion). The old unique index allowed only one linked fact, which made
-- a valid done -> undo flow fail at the database boundary. The source-key
-- index already provides idempotency for auto events, so the occurrence
-- relationship itself must remain one-to-many.
DROP INDEX IF EXISTS public.uq_occurrence_source_event;
