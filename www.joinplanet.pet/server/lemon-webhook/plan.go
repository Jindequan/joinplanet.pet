package main

// plan.go — 订阅配额层: per-plan resource quotas (pets per circle, circle
// members, attachment storage). Enforced at F2 join, F3 pet creation and F5
// uploads; surfaced read-only via GET /circles/{circleID}/usage.

import "context"

// planLimits is the set of enforceable quotas for one user's plan.
type planLimits struct {
	Pets         int   // pets per circle
	Members      int   // members per circle (including the owner)
	StorageBytes int64 // total attachment bytes per circle
}

// freePlan is the V1 default tier: 2 pets, 2 members, 50MB storage per circle.
var freePlan = planLimits{Pets: 2, Members: 2, StorageBytes: 50 << 20}

// limitsFor resolves the quotas applying to userID.
//
// TODO(权益层接 Pro): query entitlements for unexpired feature_key
// "multi_pet" / "storage_*" (canEntitle) and raise the corresponding limits.
// V1 ships only the free tier, so the constants are returned as-is.
func (a *app) limitsFor(ctx context.Context, userID int64) planLimits {
	return freePlan
}
