-- One-time care belongs to the same occurrence and responsibility system as
-- recurring care. The application already parses kind=once and materializes
-- it through care_rules; keep the database contract aligned with that path.
ALTER TABLE public.care_rules
    DROP CONSTRAINT IF EXISTS care_rules_frequency_check,
    DROP CONSTRAINT IF EXISTS care_rules_shape_check;

ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_frequency_check CHECK (frequency IN ('daily', 'weekly', 'monthly', 'interval', 'once')),
    ADD CONSTRAINT care_rules_shape_check CHECK (
      (frequency = 'daily' AND weekdays IS NULL AND day_of_month IS NULL AND interval_days IS NULL)
      OR (frequency = 'weekly' AND weekdays IS NOT NULL AND day_of_month IS NULL AND interval_days IS NULL)
      OR (frequency = 'monthly' AND weekdays IS NULL AND day_of_month IS NOT NULL AND interval_days IS NULL)
      OR (frequency = 'interval' AND interval_days IS NOT NULL AND weekdays IS NULL AND day_of_month IS NULL)
      OR (frequency = 'once' AND interval_days IS NULL AND weekdays IS NULL AND day_of_month IS NULL)
    );
