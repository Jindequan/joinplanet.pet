-- The backfill is intentionally not reversible: restoring an old open request
-- would recreate an action card for an occurrence that is already resolved.
SELECT 1;
