-- Multiple Families are a core product relationship. The old free=1 value
-- made a valid User -> Family[] model impossible in the default experience.
UPDATE plans
SET owned_families = 3
WHERE key = 'free' AND owned_families < 3;
