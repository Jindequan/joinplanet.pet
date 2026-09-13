-- Keep the Family edge that was active when a Pet Event was written.
-- Pet history remains owned by the Pet, but shared Pets need provenance when
-- the same user belongs to more than one Family.
ALTER TABLE public.pet_events
    ADD COLUMN family_id uuid REFERENCES public.families(id) ON DELETE SET NULL;

CREATE INDEX ix_pet_events_family_time
    ON public.pet_events (family_id, occurred_at DESC)
    WHERE family_id IS NOT NULL AND deleted_at IS NULL;
