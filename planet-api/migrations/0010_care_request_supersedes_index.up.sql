CREATE INDEX ix_care_requests_supersedes
    ON public.care_requests (supersedes_request_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
