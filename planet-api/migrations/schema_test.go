package migrations

import (
	_ "embed"
	"strings"
	"testing"
)

//go:embed 0001_initial.up.sql
var initialSchema string

func TestInitialSchemaIsACompleteBaseline(t *testing.T) {
	if got := strings.Count(initialSchema, "CREATE TABLE public."); got != 30 {
		t.Fatalf("baseline must define 30 final tables, got %d", got)
	}
	if strings.Contains(initialSchema, "ADD COLUMN") {
		t.Fatal("baseline must not reconstruct columns with ALTER TABLE ADD COLUMN")
	}
	if strings.Contains(initialSchema, "schema_migrations") {
		t.Fatal("migration bookkeeping must be created by the runner, not the application schema")
	}
	for _, legacy := range []string{"circle", "care_items", "care_item_id", "care_tasks_v2", "created_by uuid", "recorded_by uuid", "edited_by uuid", "pet_access_grants", "family_pets", "CREATE TABLE public.family_members (", "CREATE TABLE public.care_tasks (", "timeline_events", "pet_profiles", "login_codes", "scheduler_runs"} {
		if strings.Contains(initialSchema, legacy) {
			t.Fatalf("baseline contains legacy schema token %q", legacy)
		}
	}
	for _, forbidden := range []string{"family_id uuid,\n    name text NOT NULL", "was_primary", "ix_pets_family_active", "ADD CONSTRAINT pets_family_id_fkey", "family_deleted_members", "family_deleted_pets", "notification_prefs", "current_owner_user_id"} {
		if strings.Contains(initialSchema, forbidden) {
			t.Fatalf("baseline contains redundant Pet/Family field token %q", forbidden)
		}
	}
	for _, requiredTable := range []string{"family_memberships", "family_pet_links", "pet_user_delegations", "pet_ownerships", "care_rules", "care_plan_assignments", "care_occurrences", "pet_events", "idempotency_keys", "transactional_outbox", "audit_records"} {
		if !strings.Contains(initialSchema, "CREATE TABLE public."+requiredTable) {
			t.Fatalf("baseline is missing canonical table %s", requiredTable)
		}
	}
	for _, requiredColumn := range []string{"created_at timestamptz NOT NULL", "updated_at timestamptz NOT NULL", "deleted_at timestamptz"} {
		if !strings.Contains(initialSchema, requiredColumn) {
			t.Fatalf("baseline is missing common metadata column %s", requiredColumn)
		}
	}
	for _, seed := range []string{"('free', 'pets_created', 5)", "('pro', 'pets_created', 5)"} {
		if !strings.Contains(initialSchema, seed) {
			t.Fatalf("baseline is missing quota seed %s", seed)
		}
	}
}
