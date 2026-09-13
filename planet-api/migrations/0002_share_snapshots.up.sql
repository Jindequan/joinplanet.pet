ALTER TABLE public.share_links
  ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
