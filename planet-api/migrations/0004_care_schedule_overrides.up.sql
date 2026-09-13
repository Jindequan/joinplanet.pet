-- L1 schedule overrides: skip | move | replace (Phase D, FOUNDATION §10)

ALTER TABLE public.care_rules DROP CONSTRAINT care_rules_frequency_check;
ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_frequency_check
    CHECK (frequency IN ('daily', 'weekly', 'monthly', 'interval', 'once'));

ALTER TABLE public.care_rules DROP CONSTRAINT care_rules_shape_check;
ALTER TABLE public.care_rules
    ADD CONSTRAINT care_rules_shape_check CHECK (
      (frequency = 'daily' AND weekdays IS NULL AND day_of_month IS NULL AND interval_days IS NULL)
      OR (frequency = 'weekly' AND weekdays IS NOT NULL AND day_of_month IS NULL AND interval_days IS NULL)
      OR (frequency = 'monthly' AND weekdays IS NULL AND day_of_month IS NOT NULL AND interval_days IS NULL)
      OR (frequency = 'interval' AND interval_days IS NOT NULL AND weekdays IS NULL AND day_of_month IS NULL)
      OR (frequency = 'once' AND weekdays IS NULL AND day_of_month IS NULL AND interval_days IS NULL)
    );

CREATE TABLE public.care_schedule_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    care_rule_id uuid NOT NULL REFERENCES public.care_rules(id) ON DELETE RESTRICT,
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE RESTRICT,
    slot_date date NOT NULL,
    kind text NOT NULL,
    due_at timestamptz,
    replacement_plan_id uuid REFERENCES public.care_plans(id) ON DELETE SET NULL,
    note text NOT NULL DEFAULT '',
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT care_schedule_overrides_kind_check CHECK (kind IN ('skip', 'move', 'replace')),
    CONSTRAINT care_schedule_overrides_move_check CHECK (kind <> 'move' OR due_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_care_schedule_overrides_slot
    ON public.care_schedule_overrides (care_rule_id, slot_date)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_care_schedule_overrides_pet_date
    ON public.care_schedule_overrides (pet_id, slot_date)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_care_schedule_overrides_updated_at
    BEFORE UPDATE ON public.care_schedule_overrides
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
