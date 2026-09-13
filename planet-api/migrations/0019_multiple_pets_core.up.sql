-- Multiple pets are part of the core User -> Family -> Pet model. The
-- default plan must not block a normal household from adding a third pet.
UPDATE plans
SET active_pets = 5
WHERE key = 'free' AND active_pets < 5;

UPDATE quota_configs
SET quota_limit = 5
WHERE plan = 'free' AND resource = 'pets_created' AND quota_limit < 5;
