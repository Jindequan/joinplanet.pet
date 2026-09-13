-- A shared Pet can belong to more than one Family. A recurring care plan is
-- owned by one Family so its timezone, members, assignments and Today view
-- cannot leak across household boundaries.
ALTER TABLE public.care_plans
    ADD COLUMN family_id uuid REFERENCES public.families(id) ON DELETE RESTRICT;

-- Existing plans predate family scoping. Attach them to the Pet's primary
-- Family when one exists; NULL remains only for direct Pet-owned plans whose
-- Pet has no Family edge. Family-scoped reads never include these NULL rows.
UPDATE public.care_plans cp
SET family_id = primary_link.family_id
FROM (
    SELECT DISTINCT ON (pet_id) pet_id, family_id
    FROM public.family_pet_links
    WHERE unlinked_at IS NULL AND deleted_at IS NULL
    ORDER BY pet_id, (relationship_type = 'primary') DESC, linked_at, family_id
) AS primary_link
WHERE cp.pet_id = primary_link.pet_id
  AND cp.family_id IS NULL;

CREATE INDEX ix_care_plans_family_active
    ON public.care_plans (family_id, pet_id, status)
    WHERE deleted_at IS NULL;
