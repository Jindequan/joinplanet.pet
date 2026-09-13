package main

// plan.go — 订阅配额层: per-plan resource quotas (pets per circle, circle
// members, attachment storage). Enforced at F2 join, F3 pet creation and F5
// uploads; surfaced read-only via GET /circles/{circleID}/usage.
//
// Tier mapping (ROADMAP V1.5 + blueprint §28–§32): the free tier ships now,
// Pro/Family limits resolve from the entitlements layer ready for Phase 2
// billing. Entitlement feature_keys used here are the paid tiers themselves
// ("pro", "family") — the founding wildcard '*' unlocks the top tier. No
// billing code lives in this file.

import "context"

// planLimits is the set of enforceable quotas for one user's plan.
type planLimits struct {
	Pets         int   // pets per circle
	Members      int   // members per circle (including the owner)
	StorageBytes int64 // total attachment bytes per circle
}

// freePlan is the V1.5 default tier: 2 active pets, 2 members, 50MB storage
// per circle (ROADMAP V1.5; 50MB replaces the blueprint §24 figure).
var freePlan = planLimits{Pets: 2, Members: 2, StorageBytes: 50 << 20}

// proPlan — Pro tier (blueprint §28): 5 pets, 6 members, 10GB storage.
var proPlan = planLimits{Pets: 5, Members: 6, StorageBytes: 10 << 30}

// familyPlan — Family tier (blueprint §28): 10 pets, 10 members, 50GB storage.
var familyPlan = planLimits{Pets: 10, Members: 10, StorageBytes: 50 << 30}

// resolvePlanLimits maps the caller's entitlement feature_keys to planLimits.
// Pure decision logic (no I/O) so it is unit-testable. Precedence: the
// founding wildcard '*' and an explicit "family" grant both unlock the top
// tier; "pro" unlocks the middle tier; everything else stays free.
func resolvePlanLimits(keys map[string]bool) planLimits {
	if keys["*"] || keys["family"] {
		return familyPlan
	}
	if keys["pro"] {
		return proPlan
	}
	return freePlan
}

// limitsFor resolves the quotas applying to userID from their entitlements.
// A founding holder ('*') is granted every tier key, so they land on Family.
func (a *app) limitsFor(ctx context.Context, userID int64) planLimits {
	keys := map[string]bool{}
	for _, k := range []string{"family", "pro", "*"} {
		if a.canEntitle(ctx, userID, k) {
			keys[k] = true
		}
	}
	return resolvePlanLimits(keys)
}
