-- Development/CI only. Production rollback is restore-from-backup.
DROP TABLE IF EXISTS
  public.user_usage,
  public.entitlements,
  public.subscriptions,
  public.quota_configs,
  public.plans,
  public.auth_rate_limits,
  public.job_runs,
  public.push_tokens,
  public.audit_records,
  public.transactional_outbox,
  public.idempotency_keys,
  public.sessions,
  public.auth_challenges,
  public.share_links,
  public.pet_events,
  public.care_occurrences,
  public.care_plan_assignments,
  public.care_rules,
  public.care_plans,
  public.medications,
  public.pet_transfers,
  public.family_pet_links,
  public.pet_user_delegations,
  public.pet_ownerships,
  public.pets,
  public.family_invitations,
  public.family_memberships,
  public.families,
  public.user_preferences,
  public.users
CASCADE;

DROP FUNCTION IF EXISTS public.guard_last_family_owner();
DROP FUNCTION IF EXISTS public.reject_immutable_row_change();
DROP FUNCTION IF EXISTS public.set_updated_at();
