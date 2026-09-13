-- 0005: 清理"声明了但从未实现"的架构面（审查决议：删除，而非保留误导）。
-- 语义已在代码文档化：
--   * transactional_outbox 零引用：邮件/推送是 at-least-once + job_runs 按
--     (job, family, date) 持久去重；outbox 若未来投产，以新 forward migration 重建。
--   * audit_records 无任何写入方；审计需求回归时同上。
--   * idempotency_keys.fencing_token / lease_expires_at / response_status 零引用。
--   * care_rules.dst_policy：DST 行为由 tasks.dueAt 实现（缺口后移、歧义取早）。
--   * pet_handoffs.ends_at：计划中的"值班到期"从未实现（值班仅手动结束）。
DROP TABLE IF EXISTS public.transactional_outbox;
DROP TABLE IF EXISTS public.audit_records;

ALTER TABLE public.idempotency_keys
    DROP COLUMN IF EXISTS lease_expires_at,
    DROP COLUMN IF EXISTS fencing_token,
    DROP COLUMN IF EXISTS response_status;

ALTER TABLE public.care_rules DROP CONSTRAINT IF EXISTS care_rules_dst_check;
ALTER TABLE public.care_rules DROP COLUMN IF EXISTS dst_policy;

ALTER TABLE public.pet_handoffs DROP COLUMN IF EXISTS ends_at;
