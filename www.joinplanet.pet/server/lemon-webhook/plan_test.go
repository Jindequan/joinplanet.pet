package main

// plan_test.go — pure logic tests for the plan quota layer (no database).

import "testing"

func TestResolvePlanLimits(t *testing.T) {
	cases := []struct {
		name string
		keys map[string]bool
		want planLimits
	}{
		{"empty grants resolve to free", map[string]bool{}, freePlan},
		{"no matching keys resolve to free", map[string]bool{"multi_pet": true}, freePlan},
		{"pro unlocks the middle tier", map[string]bool{"pro": true}, proPlan},
		{"family unlocks the top tier", map[string]bool{"family": true}, familyPlan},
		{"founding wildcard unlocks top tier", map[string]bool{"*": true}, familyPlan},
		{"family beats pro", map[string]bool{"pro": true, "family": true}, familyPlan},
		{"wildcard beats pro", map[string]bool{"pro": true, "*": true}, familyPlan},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := resolvePlanLimits(c.keys); got != c.want {
				t.Fatalf("resolvePlanLimits(%v) = %+v, want %+v", c.keys, got, c.want)
			}
		})
	}
}

func TestPlanLimitsValues(t *testing.T) {
	// Guard the sanctioned quota numbers (ROADMAP V1.5 + blueprint §28).
	if freePlan != (planLimits{Pets: 2, Members: 2, StorageBytes: 50 << 20}) {
		t.Fatalf("freePlan changed unexpectedly: %+v", freePlan)
	}
	if proPlan != (planLimits{Pets: 5, Members: 6, StorageBytes: 10 << 30}) {
		t.Fatalf("proPlan changed unexpectedly: %+v", proPlan)
	}
	if familyPlan != (planLimits{Pets: 10, Members: 10, StorageBytes: 50 << 30}) {
		t.Fatalf("familyPlan changed unexpectedly: %+v", familyPlan)
	}
}
