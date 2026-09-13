-- L3 接力：值班元数据（事实仍在 pet_events；不建平行待办表）
CREATE TABLE public.pet_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pet_handoffs_one_active_per_pet
  ON public.pet_handoffs (pet_id)
  WHERE ended_at IS NULL;

CREATE INDEX pet_handoffs_user_active
  ON public.pet_handoffs (user_id)
  WHERE ended_at IS NULL;
