DROP TABLE IF EXISTS public.care_schedule_overrides;

DELETE FROM public.care_occurrences co
USING public.care_rules cr
WHERE co.care_rule_id = cr.id AND cr.frequency = 'once';

DELETE FROM public.care_rules WHERE frequency = 'once';

ALTER TABLE public.care_rules DROP CONSTRAINT care_rules_shape_check;
ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_shape_check CHECK (
      (frequency = 'daily' AND weekdays IS NULL AND day_of_month IS NULL)
      OR (frequency = 'weekly' AND weekdays IS NOT NULL AND day_of_month IS NULL)
      OR (frequency = 'monthly' AND weekdays IS NULL AND day_of_month IS NOT NULL)
      OR (frequency = 'interval' AND interval_days IS NOT NULL AND weekdays IS NULL AND day_of_month IS NULL)
    );

ALTER TABLE public.care_rules DROP CONSTRAINT care_rules_frequency_check;
ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_frequency_check
    CHECK (frequency IN ('daily', 'weekly', 'monthly', 'interval'));
