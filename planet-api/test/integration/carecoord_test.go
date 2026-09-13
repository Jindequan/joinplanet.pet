package integration

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/joinplanet/planet-api/internal/app"
	"github.com/joinplanet/planet-api/internal/contracts"
	"github.com/joinplanet/planet-api/internal/modules/carecoord"
	"github.com/joinplanet/planet-api/internal/modules/entitlements"
	"github.com/joinplanet/planet-api/internal/modules/families"
	"github.com/joinplanet/planet-api/internal/modules/pets"
	"github.com/joinplanet/planet-api/internal/platform/email"
)

type capturedCareNotification struct {
	userID string
	title  string
	body   string
	kind   string
	data   map[string]string
}

type captureNotifier struct {
	calls []capturedCareNotification
}

var _ contracts.UserNotifier = (*captureNotifier)(nil)

func (n *captureNotifier) NotifyUser(context.Context, string, string, string, string) error {
	return nil
}

func (n *captureNotifier) NotifyUserData(_ context.Context, userID, title, body, kind string, data map[string]string) error {
	n.calls = append(n.calls, capturedCareNotification{userID: userID, title: title, body: body, kind: kind, data: data})
	return nil
}

func careCoordServiceForTest(e *Env, notifier contracts.UserNotifier) *carecoord.Service {
	entitlementsSvc := &entitlements.Service{Pool: e.Pool}
	familySvc := &families.Service{Repo: &families.Repo{Pool: e.Pool}, Pool: e.Pool, Ent: entitlementsSvc}
	petSvc := &pets.Service{Repo: &pets.Repo{Pool: e.Pool}, Pool: e.Pool, Members: familySvc, Ent: entitlementsSvc}
	return &carecoord.Service{
		Repo:     &carecoord.Repo{Pool: e.Pool},
		Pool:     e.Pool,
		Guard:    petSvc,
		Notifier: notifier,
	}
}

func TestCareRequestDelegateAcceptAndInbox(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-member")

	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}

	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚饭后遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	task := created.Body["task"].(map[string]any)
	taskID := task["id"].(string)
	var initialAssignee *string
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&initialAssignee); err != nil {
		t.Fatalf("read initial occurrence assignment: %v", err)
	}
	if initialAssignee != nil {
		t.Fatalf("new occurrence in a multi-member Family must start unassigned, got %s", *initialAssignee)
	}

	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "我今天加班，能请你接手吗？",
	}, "cr-request-1")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	request := requested.Body["care_request"].(map[string]any)
	requestID := request["id"].(string)
	if request["state"] != "sent" {
		t.Fatalf("new request state: %v", request)
	}
	todayAfterRequest := e.Do("GET", "/api/v1/today?family_id="+familyID, ownerTok, nil)
	if todayAfterRequest.Status != http.StatusOK {
		t.Fatalf("today after request: %d %v", todayAfterRequest.Status, todayAfterRequest.Body)
	}
	todayPets := todayAfterRequest.Body["pets"].([]any)
	todayItems := todayPets[0].(map[string]any)["items"].([]any)
	todayCareRequest := todayItems[0].(map[string]any)["care_request"].(map[string]any)
	if todayCareRequest["id"] != requestID || todayCareRequest["state"] != "sent" {
		t.Fatalf("today request projection: %v", todayCareRequest)
	}

	inbox := e.Do("GET", "/api/v1/care-requests/inbox", memberTok, nil)
	if inbox.Status != http.StatusOK {
		t.Fatalf("member inbox: %d %v", inbox.Status, inbox.Body)
	}
	items := inbox.Body["care_requests"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["id"] != requestID {
		t.Fatalf("unexpected inbox: %v", inbox.Body)
	}

	seen := e.Do("POST", "/api/v1/care-requests/"+requestID+"/seen", memberTok, nil)
	if seen.Status != http.StatusOK || seen.Body["care_request"].(map[string]any)["state"] != "seen" {
		t.Fatalf("mark seen: %d %v", seen.Status, seen.Body)
	}

	delegated := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/delegate", memberTok, map[string]any{
		"target_user_id": ownerID, "message": "我也不行，交回给你。",
	}, "cr-delegate-1")
	if delegated.Status != http.StatusCreated {
		t.Fatalf("delegate request: %d %v", delegated.Status, delegated.Body)
	}
	next := delegated.Body["care_request"].(map[string]any)
	nextID := next["id"].(string)
	if next["state"] != "sent" || next["target_user_id"] != ownerID {
		t.Fatalf("unexpected delegated request: %v", next)
	}
	ownerView := e.Do("GET", "/api/v1/care-requests/"+nextID, ownerTok, nil)
	if ownerView.Status != http.StatusOK || ownerView.Body["care_request"].(map[string]any)["id"] != nextID {
		t.Fatalf("prior chain participant must read delegated request: %d %v", ownerView.Status, ownerView.Body)
	}

	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+nextID+"/accept", ownerTok, map[string]any{
		"note": "我来做。",
	}, "cr-accept-1")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept request: %d %v", accepted.Status, accepted.Body)
	}
	if accepted.Body["care_request"].(map[string]any)["state"] != "accepted" {
		t.Fatalf("accepted state: %v", accepted.Body)
	}
	chain := e.Do("GET", "/api/v1/care-requests/"+nextID+"/chain", ownerTok, nil)
	if chain.Status != http.StatusOK {
		t.Fatalf("request chain: %d %v", chain.Status, chain.Body)
	}
	chainItems := chain.Body["care_requests"].([]any)
	if len(chainItems) != 2 {
		t.Fatalf("request chain length=%d, want 2: %v", len(chainItems), chain.Body)
	}
	firstChainItem := chainItems[0].(map[string]any)
	lastChainItem := chainItems[1].(map[string]any)
	if firstChainItem["id"] != requestID || firstChainItem["state"] != "delegated" {
		t.Fatalf("first chain item: %v", firstChainItem)
	}
	if lastChainItem["id"] != nextID || lastChainItem["state"] != "accepted" {
		t.Fatalf("last chain item: %v", lastChainItem)
	}

	var assigned string
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&assigned); err != nil {
		t.Fatalf("read assigned occurrence: %v", err)
	}
	if assigned != ownerID {
		t.Fatalf("occurrence assigned to %s, want %s", assigned, ownerID)
	}
	todayAfterAccept := e.Do("GET", "/api/v1/today?family_id="+familyID, ownerTok, nil)
	if todayAfterAccept.Status != http.StatusOK {
		t.Fatalf("today after accept: %d %v", todayAfterAccept.Status, todayAfterAccept.Body)
	}
	acceptedProjection := todayAfterAccept.Body["pets"].([]any)[0].(map[string]any)["items"].([]any)[0].(map[string]any)["care_request"].(map[string]any)
	if acceptedProjection["id"] != nextID || acceptedProjection["state"] != "accepted" {
		t.Fatalf("today accepted projection: %v", acceptedProjection)
	}
	followUp := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "如果还需要，再请你接手。",
	}, "cr-request-after-accept")
	if followUp.Status != http.StatusCreated {
		t.Fatalf("create follow-up request after accepted handoff: %d %v", followUp.Status, followUp.Body)
	}
	followUpRequest := followUp.Body["care_request"].(map[string]any)
	if followUpRequest["supersedes_request_id"] != nextID {
		t.Fatalf("follow-up request must continue the accepted chain: %v", followUpRequest)
	}
	var previousState string
	if err := e.Pool.QueryRow(context.Background(), `SELECT state FROM care_requests WHERE id=$1`, nextID).Scan(&previousState); err != nil {
		t.Fatalf("read previous responsibility state: %v", err)
	}
	if previousState != "delegated" {
		t.Fatalf("previous accepted request must close when handed off again, got %q", previousState)
	}

	var events int
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT count(*) FROM care_request_events WHERE request_id IN ($1,$2)`, requestID, nextID).Scan(&events); err != nil {
		t.Fatalf("read request events: %v", err)
	}
	if events != 6 {
		t.Fatalf("request event count=%d, want 6 across seen/delegated/sent/accepted and follow-up handoff", events)
	}
}

func TestRemovingMemberReleasesOpenCareWork(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("member-removal-care", "Milo")
	memberTok, memberID, _ := e.NewUser("member-removal-care-member")

	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"移除成员测试","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	if assigned := e.Do("PUT", "/api/v1/care-plans/"+taskID+"/assignments/"+memberID, ownerTok, map[string]any{"role": "helper"}); assigned.Status != http.StatusOK {
		t.Fatalf("assign member: %d %v", assigned.Status, assigned.Body)
	}
	if _, err := e.Pool.Exec(context.Background(), `UPDATE care_occurrences SET assigned_to_user_id=$2 WHERE id=$1`, taskID, memberID); err != nil {
		t.Fatalf("assign current occurrence: %v", err)
	}
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", memberTok, map[string]any{
		"family_id": familyID, "target_user_id": ownerID, "message": "我今天无法处理",
	}, "member-removal-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	if removed := e.Do("DELETE", "/api/v1/families/"+familyID+"/members/"+memberID, ownerTok, nil); removed.Status != http.StatusNoContent {
		t.Fatalf("remove member: %d %v", removed.Status, removed.Body)
	}
	var assignedTo *string
	if err := e.Pool.QueryRow(context.Background(), `SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&assignedTo); err != nil {
		t.Fatalf("read released occurrence: %v", err)
	}
	if assignedTo != nil {
		t.Fatalf("removed member must not remain assigned to open occurrence: %v", *assignedTo)
	}
	request := e.Do("GET", "/api/v1/care-requests/"+requestID, ownerTok, nil)
	if request.Status != http.StatusOK || request.Body["care_request"].(map[string]any)["state"] != "cancelled" {
		t.Fatalf("request must be cancelled after member removal: %d %v", request.Status, request.Body)
	}
}

func TestCareHandoffBatchCreatesOneRequestPerOccurrenceAndSupportsPartialAcceptance(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-batch", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-batch-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}

	occurrenceIDs := make([]string, 0, 3)
	for _, title := range []string{"晚饭后遛狗", "晚上喂食", "睡前补水"} {
		created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
			`{"title":"`+title+`","schedule":{"v":1,"kind":"daily"}}`)
		if created.Status != http.StatusCreated {
			t.Fatalf("create care plan %q: %d %v", title, created.Status, created.Body)
		}
		occurrenceIDs = append(occurrenceIDs, created.Body["task"].(map[string]any)["id"].(string))
	}

	created := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID,
		"occurrence_ids": occurrenceIDs,
		"message":        "我今晚加班，麻烦你接班。",
	}, "cr-batch-create")
	if created.Status != http.StatusCreated {
		t.Fatalf("create batch: %d %v", created.Status, created.Body)
	}
	batch := created.Body["batch"].(map[string]any)
	batchID := batch["id"].(string)
	previousByOccurrence := make(map[string]string, len(occurrenceIDs))
	if batch["total_count"] != float64(3) || len(batch["requests"].([]any)) != 3 {
		t.Fatalf("unexpected batch projection: %v", batch)
	}
	for _, raw := range batch["requests"].([]any) {
		request := raw.(map[string]any)
		previousByOccurrence[request["occurrence_id"].(string)] = request["id"].(string)
		if request["batch_id"] != batchID || request["state"] != "sent" {
			t.Fatalf("batch request projection: %v", request)
		}
	}

	inbox := e.Do("GET", "/api/v1/care-handoff-batches/inbox", memberTok, nil)
	if inbox.Status != http.StatusOK {
		t.Fatalf("batch inbox: %d %v", inbox.Status, inbox.Body)
	}
	if len(inbox.Body["batches"].([]any)) != 1 {
		t.Fatalf("batch should be one inbox card: %v", inbox.Body)
	}

	partial := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/accept", memberTok, map[string]any{
		"occurrence_ids": occurrenceIDs[:2],
	}, "cr-batch-accept-partial")
	if partial.Status != http.StatusOK {
		t.Fatalf("partial accept: %d %v", partial.Status, partial.Body)
	}
	results := partial.Body["results"].([]any)
	var changed, notSelected int
	for _, raw := range results {
		result := raw.(map[string]any)
		switch result["outcome"] {
		case "changed":
			changed++
		case "not_selected":
			notSelected++
		}
	}
	if changed != 2 || notSelected != 1 {
		t.Fatalf("partial results must be explicit: %v", results)
	}
	partialBatch := partial.Body["batch"].(map[string]any)
	if partialBatch["accepted_count"] != float64(2) || partialBatch["open_count"] != float64(1) {
		t.Fatalf("partial batch counts: %v", partialBatch)
	}

	replay := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/accept", memberTok, map[string]any{
		"occurrence_ids": occurrenceIDs[:2],
	}, "cr-batch-accept-partial")
	if replay.Status != http.StatusOK {
		t.Fatalf("replay partial accept: %d %v", replay.Status, replay.Body)
	}
	if replay.Body["batch"].(map[string]any)["accepted_count"] != float64(2) {
		t.Fatalf("replay must not accept another occurrence: %v", replay.Body)
	}

	finish := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/accept", memberTok, map[string]any{}, "cr-batch-accept-rest")
	if finish.Status != http.StatusOK {
		t.Fatalf("accept remaining batch item: %d %v", finish.Status, finish.Body)
	}
	if finish.Body["batch"].(map[string]any)["accepted_count"] != float64(3) {
		t.Fatalf("all items should be accepted after second action: %v", finish.Body)
	}

	for _, occurrenceID := range occurrenceIDs {
		var assigned string
		if err := e.Pool.QueryRow(context.Background(), `SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, occurrenceID).Scan(&assigned); err != nil {
			t.Fatalf("read assigned occurrence %s: %v", occurrenceID, err)
		}
		if assigned != memberID {
			t.Fatalf("occurrence %s assigned to %s, want %s", occurrenceID, assigned, memberID)
		}
	}
	followUp := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", memberTok, map[string]any{
		"target_user_id": ownerID,
		"occurrence_ids": occurrenceIDs,
		"message":        "我接手后需要再交给你。",
	}, "cr-batch-create-follow-up")
	if followUp.Status != http.StatusCreated {
		t.Fatalf("create follow-up batch: %d %v", followUp.Status, followUp.Body)
	}
	for _, raw := range followUp.Body["batch"].(map[string]any)["requests"].([]any) {
		request := raw.(map[string]any)
		if request["supersedes_request_id"] != previousByOccurrence[request["occurrence_id"].(string)] {
			t.Fatalf("follow-up batch must continue each occurrence chain: %v", request)
		}
	}
}

func TestCareHandoffBatchCanContinueToAnotherFamilyMemberWithoutNewOccurrences(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-batch-delegate", "Milo")
	firstTok, firstID, _ := e.NewUser("cr-batch-delegate-first")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", firstTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join first family member: %d %v", joined.Status, joined.Body)
	}
	secondTok, secondID := ownerTok, ownerID

	occurrenceIDs := make([]string, 0, 3)
	for _, title := range []string{"晚饭后遛狗", "晚上喂食", "睡前补水"} {
		created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
			`{"title":"`+title+`","schedule":{"v":1,"kind":"daily"}}`)
		if created.Status != http.StatusCreated {
			t.Fatalf("create care plan %q: %d %v", title, created.Status, created.Body)
		}
		occurrenceIDs = append(occurrenceIDs, created.Body["task"].(map[string]any)["id"].(string))
	}

	created := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": firstID,
		"occurrence_ids": occurrenceIDs,
		"message":        "我今晚加班，麻烦你接班。",
	}, "cr-batch-delegate-create")
	if created.Status != http.StatusCreated {
		t.Fatalf("create delegate batch: %d %v", created.Status, created.Body)
	}
	previous := created.Body["batch"].(map[string]any)
	previousID := previous["id"].(string)
	previousRequestIDs := make(map[string]string, len(occurrenceIDs))
	for _, raw := range previous["requests"].([]any) {
		request := raw.(map[string]any)
		previousRequestIDs[request["occurrence_id"].(string)] = request["id"].(string)
	}

	delegated := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+previousID+"/delegate", firstTok, map[string]any{
		"target_user_id": secondID,
		"occurrence_ids": occurrenceIDs[:2],
		"message":        "我也有事，麻烦你继续接班。",
	}, "cr-batch-delegate-next")
	if delegated.Status != http.StatusOK {
		t.Fatalf("delegate batch: %d %v", delegated.Status, delegated.Body)
	}
	next := delegated.Body["batch"].(map[string]any)
	if next["target_user_id"] != secondID || next["total_count"] != float64(2) {
		t.Fatalf("next batch projection: %v", next)
	}
	previousView := delegated.Body["previous_batch"].(map[string]any)
	if previousView["open_count"] != float64(1) {
		t.Fatalf("previous batch should retain only the unselected open item: %v", previousView)
	}
	for _, raw := range previousView["requests"].([]any) {
		request := raw.(map[string]any)
		if request["state"] == "delegated" && request["next_target_user_id"] != secondID {
			t.Fatalf("delegated history must expose the next responsible member: %v", request)
		}
	}
	var changed, notSelected int
	for _, raw := range delegated.Body["results"].([]any) {
		result := raw.(map[string]any)
		switch result["outcome"] {
		case "changed":
			changed++
		case "not_selected":
			notSelected++
		}
	}
	if changed != 2 || notSelected != 1 {
		t.Fatalf("delegation results must be explicit: %v", delegated.Body["results"])
	}
	nextRequestIDs := make(map[string]string, 2)
	for _, raw := range next["requests"].([]any) {
		request := raw.(map[string]any)
		occurrenceID := request["occurrence_id"].(string)
		nextRequestIDs[occurrenceID] = request["id"].(string)
		if request["supersedes_request_id"] != previousRequestIDs[occurrenceID] {
			t.Fatalf("delegated request must continue its occurrence chain: %v", request)
		}
	}
	today := e.Do("GET", "/api/v1/today?family_id="+familyID, ownerTok, nil)
	if today.Status != http.StatusOK {
		t.Fatalf("today after batch delegation: %d %v", today.Status, today.Body)
	}
	seenToday := make(map[string]bool, 2)
	for _, rawPet := range today.Body["pets"].([]any) {
		for _, rawItem := range rawPet.(map[string]any)["items"].([]any) {
			item := rawItem.(map[string]any)
			task := item["task"].(map[string]any)
			occurrenceID := task["id"].(string)
			request, ok := item["care_request"].(map[string]any)
			if expectedID, expected := nextRequestIDs[occurrenceID]; expected {
				if !ok || request["id"] != expectedID || request["state"] != "sent" {
					t.Fatalf("Today must project the newest delegated request: occurrence=%s item=%v", occurrenceID, item)
				}
				seenToday[occurrenceID] = true
			}
		}
	}
	if len(seenToday) != len(nextRequestIDs) {
		t.Fatalf("Today omitted delegated occurrences: seen=%v expected=%v", seenToday, nextRequestIDs)
	}

	replay := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+previousID+"/delegate", firstTok, map[string]any{
		"target_user_id": secondID,
		"occurrence_ids": occurrenceIDs[:2],
		"message":        "我也有事，麻烦你继续接班。",
	}, "cr-batch-delegate-next")
	if replay.Status != http.StatusOK || replay.Body["batch"].(map[string]any)["id"] != next["id"] {
		t.Fatalf("delegation replay must return the same next batch: %d %v", replay.Status, replay.Body)
	}

	accepted := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+next["id"].(string)+"/accept", secondTok, map[string]any{}, "cr-batch-delegate-accept")
	if accepted.Status != http.StatusOK || accepted.Body["batch"].(map[string]any)["accepted_count"] != float64(2) {
		t.Fatalf("next batch should be actionable by the next member: %d %v", accepted.Status, accepted.Body)
	}
	for _, occurrenceID := range occurrenceIDs[:2] {
		var assigned string
		if err := e.Pool.QueryRow(context.Background(), `SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, occurrenceID).Scan(&assigned); err != nil {
			t.Fatalf("read delegated occurrence %s: %v", occurrenceID, err)
		}
		if assigned != secondID {
			t.Fatalf("delegated occurrence %s assigned to %s, want %s", occurrenceID, assigned, secondID)
		}
	}
	var occurrenceCount int
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM care_occurrences WHERE id = ANY($1::uuid[])`, occurrenceIDs).Scan(&occurrenceCount); err != nil {
		t.Fatalf("count delegated occurrences: %v", err)
	}
	if occurrenceCount != len(occurrenceIDs) {
		t.Fatalf("delegation must not create occurrences: %d", occurrenceCount)
	}
}

func TestCareHandoffBatchDelegationDoesNotDuplicateActionAndStatusNotifications(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-batch-notify-dedupe", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-batch-notify-dedupe-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family member: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"通知去重验收","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	occurrenceID := created.Body["task"].(map[string]any)["id"].(string)
	batch := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID,
		"occurrence_ids": []string{occurrenceID},
		"message":        "请先接手。",
	}, "cr-batch-notify-dedupe-create")
	if batch.Status != http.StatusCreated {
		t.Fatalf("create batch: %d %v", batch.Status, batch.Body)
	}
	batchID := batch.Body["batch"].(map[string]any)["id"].(string)
	notifier := &captureNotifier{}
	service := careCoordServiceForTest(e, notifier)
	if _, err := service.DelegateBatch(context.Background(), memberID, batchID, ownerID, "我也有事，请继续接班。", []string{occurrenceID}, "cr-batch-notify-dedupe-delegate"); err != nil {
		t.Fatalf("delegate batch: %v", err)
	}
	if len(notifier.calls) != 1 {
		t.Fatalf("original sender should receive one actionable notification, got %d: %+v", len(notifier.calls), notifier.calls)
	}
	if notifier.calls[0].userID != ownerID || notifier.calls[0].kind != "care_handoff_batch" {
		t.Fatalf("original sender should receive the new action card only: %+v", notifier.calls)
	}
}

func TestCareHandoffBatchDeclineContinuesThroughReassign(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-batch-reassign", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-batch-reassign-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family member: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"拒绝后继续安排","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	occurrenceID := created.Body["task"].(map[string]any)["id"].(string)
	batch := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID,
		"occurrence_ids": []string{occurrenceID},
		"message":        "今晚麻烦你接班。",
	}, "cr-batch-reassign-create")
	if batch.Status != http.StatusCreated {
		t.Fatalf("create batch: %d %v", batch.Status, batch.Body)
	}
	batchID := batch.Body["batch"].(map[string]any)["id"].(string)
	declined := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/decline", memberTok, map[string]any{}, "cr-batch-reassign-decline")
	if declined.Status != http.StatusOK || declined.Body["batch"].(map[string]any)["declined_count"] != float64(1) {
		t.Fatalf("decline batch: %d %v", declined.Status, declined.Body)
	}

	reassigned := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/reassign", memberTok, map[string]any{
		"target_user_id": ownerID,
		"message":        "我也不行，请你继续接班。",
	}, "cr-batch-reassign-next")
	if reassigned.Status != http.StatusOK {
		t.Fatalf("reassign declined batch: %d %v", reassigned.Status, reassigned.Body)
	}
	next := reassigned.Body["batch"].(map[string]any)
	if next["target_user_id"] != ownerID || next["total_count"] != float64(1) {
		t.Fatalf("reassigned batch projection: %v", next)
	}
	previous := reassigned.Body["previous_batch"].(map[string]any)
	if previous["open_count"] != float64(0) || previous["declined_count"] != float64(1) {
		t.Fatalf("declined batch should remain resolved history: %v", previous)
	}
	request := next["requests"].([]any)[0].(map[string]any)
	previousRequest := previous["requests"].([]any)[0].(map[string]any)
	if request["supersedes_request_id"] != previousRequest["id"] || request["state"] != "sent" || previousRequest["next_target_user_id"] != ownerID {
		t.Fatalf("reassigned request must continue declined history: %v", request)
	}

	accepted := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+next["id"].(string)+"/accept", ownerTok, map[string]any{}, "cr-batch-reassign-accept")
	if accepted.Status != http.StatusOK || accepted.Body["batch"].(map[string]any)["accepted_count"] != float64(1) {
		t.Fatalf("accept reassigned batch: %d %v", accepted.Status, accepted.Body)
	}
}

func TestCareHandoffBatchReassignDoesNotCreateParallelOpenRequest(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-batch-reassign-open", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-batch-reassign-open-member")
	otherTok, otherID, _ := e.NewUser("cr-batch-reassign-open-other")
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET members=3 WHERE key='free'`); err != nil {
		t.Fatalf("expand test member quota: %v", err)
	}
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	for _, token := range []string{memberTok, otherTok} {
		if joined := e.Do("POST", "/api/v1/families/join", token, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
			t.Fatalf("join family member: %d %v", joined.Status, joined.Body)
		}
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"防止平行责任","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	occurrenceID := created.Body["task"].(map[string]any)["id"].(string)
	batch := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID,
		"occurrence_ids": []string{occurrenceID},
	}, "cr-batch-reassign-open-create")
	if batch.Status != http.StatusCreated {
		t.Fatalf("create batch: %d %v", batch.Status, batch.Body)
	}
	batchView := batch.Body["batch"].(map[string]any)
	batchID := batchView["id"].(string)
	declined := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/decline", memberTok, map[string]any{}, "cr-batch-reassign-open-decline")
	if declined.Status != http.StatusOK {
		t.Fatalf("decline batch: %d %v", declined.Status, declined.Body)
	}
	newRequest := e.doWithHeader("POST", "/api/v1/care-occurrences/"+occurrenceID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": otherID, "message": "先重新发一张新的行动卡。",
	}, "cr-batch-reassign-open-request")
	if newRequest.Status != http.StatusCreated {
		t.Fatalf("create newer open request: %d %v", newRequest.Status, newRequest.Body)
	}

	reassigned := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/reassign", memberTok, map[string]any{
		"target_user_id": ownerID,
	}, "cr-batch-reassign-open-next")
	if reassigned.Status != http.StatusOK {
		t.Fatalf("reassign with newer open request: %d %v", reassigned.Status, reassigned.Body)
	}
	results := reassigned.Body["results"].([]any)
	if len(results) != 1 || results[0].(map[string]any)["outcome"] != "not_actionable" || results[0].(map[string]any)["reason"] != "occurrence_open" {
		t.Fatalf("reassign should explain the existing open responsibility: %v", reassigned.Body)
	}
	if _, exists := reassigned.Body["previous_batch"]; exists {
		t.Fatalf("blocked reassign must not create a next batch: %v", reassigned.Body)
	}
	var openCount int
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM care_requests WHERE occurrence_id=$1 AND state IN ('sent','seen') AND deleted_at IS NULL`, occurrenceID).Scan(&openCount); err != nil {
		t.Fatalf("count open requests: %v", err)
	}
	if openCount != 1 {
		t.Fatalf("occurrence must retain exactly one open request, got %d", openCount)
	}
}

func TestCareHandoffBatchEnforcesSelectedTimeWindowBeforeWriting(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-batch-window", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-batch-window-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"窗口内遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	var dueAt time.Time
	if err := e.Pool.QueryRow(context.Background(), `SELECT due_at FROM care_occurrences WHERE id=$1`, taskID).Scan(&dueAt); err != nil {
		t.Fatalf("read occurrence due_at: %v", err)
	}

	outside := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID,
		"occurrence_ids": []string{taskID},
		"starts_at":      dueAt.Add(time.Hour).Format(time.RFC3339),
		"ends_at":        dueAt.Add(2 * time.Hour).Format(time.RFC3339),
	}, "cr-batch-window-outside")
	if outside.Status != http.StatusConflict || outside.Body["error"].(map[string]any)["code"] != "CARE_OCCURRENCE_OUTSIDE_HANDOFF_WINDOW" {
		t.Fatalf("outside window must be rejected without a batch: %d %v", outside.Status, outside.Body)
	}
	var batches int
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FROM care_handoff_batches WHERE family_id=$1`, familyID).Scan(&batches); err != nil {
		t.Fatalf("count batches after rejection: %v", err)
	}
	if batches != 0 {
		t.Fatalf("rejected batch must not write a partial envelope: %d", batches)
	}

	inside := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID,
		"occurrence_ids": []string{taskID},
		"starts_at":      dueAt.Add(-time.Hour).Format(time.RFC3339),
		"ends_at":        dueAt.Add(time.Hour).Format(time.RFC3339),
	}, "cr-batch-window-inside")
	if inside.Status != http.StatusCreated {
		t.Fatalf("inside window should create batch: %d %v", inside.Status, inside.Body)
	}
}

func TestCareRequestAcceptedCaregiverCanCompleteOneOffOccurrence(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-one-off", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-one-off-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"临时遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)

	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "我今天加班，麻烦你遛一下 Milo。",
	}, "cr-one-off-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)
	if _, err := e.Pool.Exec(context.Background(),
		// Keep the occurrence on the current civil day in the family's timezone.
		// Adding time.Now()+30m crosses midnight when the suite runs late in UTC,
		// which correctly triggers the future-date guard but makes this test flaky.
		`UPDATE care_occurrences SET due_at=$2, assigned_to_user_id=NULL WHERE id=$1`, taskID, time.Now().Add(-30*time.Minute)); err != nil {
		t.Fatalf("make occurrence near due and unassigned: %v", err)
	}
	ops := app.NewProactiveOps(e.Pool, slog.New(slog.NewTextHandler(io.Discard, nil)), &email.DevSender{Log: slog.Default()})
	risksBefore, err := ops.Tasks.UnassignedCareRisks(context.Background(), familyID, time.Now())
	if err != nil {
		t.Fatalf("read unassigned risk before accept: %v", err)
	}
	if !containsCareRiskOccurrence(risksBefore, taskID) {
		t.Fatalf("unassigned occurrence must be a risk before accept: %+v", risksBefore)
	}
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-one-off-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept request: %d %v", accepted.Status, accepted.Body)
	}
	risksAfter, err := ops.Tasks.UnassignedCareRisks(context.Background(), familyID, time.Now())
	if err != nil {
		t.Fatalf("read unassigned risk after accept: %v", err)
	}
	if containsCareRiskOccurrence(risksAfter, taskID) {
		t.Fatalf("accepted occurrence must leave the unassigned risk projection: %+v", risksAfter)
	}

	// The member is intentionally not a standing care-plan assignment. The
	// accepted request itself must authorize this one occurrence.
	completed := e.Do("POST", "/api/v1/tasks/"+taskID+"/logs", memberTok, map[string]any{"status": "done"})
	if completed.Status != http.StatusCreated {
		t.Fatalf("accepted one-off caregiver must complete occurrence: %d %v", completed.Status, completed.Body)
	}
	log := completed.Body["log"].(map[string]any)
	if log["done_by"] != memberID {
		t.Fatalf("one-off completion recorded wrong actor: %v", log)
	}
	chain := e.Do("GET", "/api/v1/care-requests/"+requestID+"/chain", memberTok, nil)
	if chain.Status != http.StatusOK {
		t.Fatalf("completed request chain: %d %v", chain.Status, chain.Body)
	}
	chainItem := chain.Body["care_requests"].([]any)[0].(map[string]any)
	if chainItem["occurrence_completed_by_user_id"] != memberID || chainItem["occurrence_completed_by_name"] == "" {
		t.Fatalf("chain must expose final executor: %v", chainItem)
	}
}

func containsCareRiskOccurrence(risks []contracts.CareRisk, occurrenceID string) bool {
	for _, risk := range risks {
		if risk.OccurrenceID == occurrenceID {
			return true
		}
	}
	return false
}

func TestCareOccurrenceClaimIsIdempotentAndRespectsOpenRequest(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-claim", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-claim-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}

	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"无人负责的遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create claim task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	if _, err := e.Pool.Exec(context.Background(), `UPDATE care_occurrences SET assigned_to_user_id=NULL WHERE id=$1`, taskID); err != nil {
		t.Fatalf("make occurrence unassigned: %v", err)
	}

	claimed := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-occurrences/"+taskID+"/claim", memberTok, map[string]any{}, "cr-claim-1")
	if claimed.Status != http.StatusOK {
		t.Fatalf("claim occurrence: %d %v", claimed.Status, claimed.Body)
	}
	claim := claimed.Body["claim"].(map[string]any)
	if claim["occurrence_id"] != taskID || claim["assigned_to_user_id"] != memberID {
		t.Fatalf("claim projection: %v", claim)
	}
	replay := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-occurrences/"+taskID+"/claim", memberTok, map[string]any{}, "cr-claim-1")
	if replay.Status != http.StatusOK || replay.Body["claim"].(map[string]any)["occurrence_id"] != taskID {
		t.Fatalf("claim replay: %d %v", replay.Status, replay.Body)
	}
	otherClaim := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-occurrences/"+taskID+"/claim", ownerTok, map[string]any{}, "cr-claim-owner")
	if otherClaim.Status != http.StatusConflict || e.ErrorCode(otherClaim) != "CARE_OCCURRENCE_ASSIGNED" {
		t.Fatalf("claim by another member must preserve responsibility: %d %v", otherClaim.Status, otherClaim.Body)
	}

	requested := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"已有请求的喂饭","schedule":{"v":1,"kind":"daily"}}`)
	if requested.Status != http.StatusCreated {
		t.Fatalf("create requested task: %d %v", requested.Status, requested.Body)
	}
	requestedID := requested.Body["task"].(map[string]any)["id"].(string)
	if _, err := e.Pool.Exec(context.Background(), `UPDATE care_occurrences SET assigned_to_user_id=NULL WHERE id=$1`, requestedID); err != nil {
		t.Fatalf("make requested occurrence unassigned: %v", err)
	}
	request := e.doWithHeader("POST", "/api/v1/care-occurrences/"+requestedID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "请你接手",
	}, "cr-claim-open-request")
	if request.Status != http.StatusCreated {
		t.Fatalf("create open request: %d %v", request.Status, request.Body)
	}
	bypass := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-occurrences/"+requestedID+"/claim", memberTok, map[string]any{}, "cr-claim-bypass")
	if bypass.Status != http.StatusConflict || e.ErrorCode(bypass) != "CARE_REQUEST_RESPONSE_REQUIRED" {
		t.Fatalf("claim must not bypass open request: %d %v", bypass.Status, bypass.Body)
	}
}

func TestCareRequestNotificationReplayIsSilentAndHandoffFeedbackReachesChain(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-notify-chain", "Milo")
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET members=3 WHERE key='free'`); err != nil {
		t.Fatalf("expand test member quota: %v", err)
	}
	memberTok, memberID, _ := e.NewUser("cr-notify-member")
	thirdTok, thirdID, _ := e.NewUser("cr-notify-third")

	inviteB := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": inviteB.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join member: %d %v", joined.Status, joined.Body)
	}
	inviteC := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", thirdTok, map[string]any{"code": inviteC.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join third member: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"通知链遛狗","schedule":{"v":1,"kind":"daily"},"time_of_day":"18:00"}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)

	capture := &captureNotifier{}
	service := careCoordServiceForTest(e, capture)
	request, err := service.Create(context.Background(), ownerID, familyID, taskID, memberID, "我今天加班", "notify-create")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if len(capture.calls) != 1 || capture.calls[0].userID != memberID {
		t.Fatalf("create notification: %+v", capture.calls)
	}
	if !strings.Contains(capture.calls[0].title, "把「通知链遛狗」交给你") || !strings.Contains(capture.calls[0].body, "18:00") || !strings.Contains(capture.calls[0].body, "通知链遛狗") {
		t.Fatalf("action notification must include sender, local care time, and title: %+v", capture.calls[0])
	}
	if _, err := service.Create(context.Background(), ownerID, familyID, taskID, memberID, "我今天加班", "notify-create"); err != nil {
		t.Fatalf("create replay: %v", err)
	}
	if len(capture.calls) != 1 {
		t.Fatalf("idempotent create replay must not resend notification: %+v", capture.calls)
	}

	next, err := service.Delegate(context.Background(), memberID, request.ID, thirdID, "请你接手", "notify-delegate")
	if err != nil {
		t.Fatalf("delegate request: %v", err)
	}
	if len(capture.calls) != 3 {
		t.Fatalf("delegate should notify target and prior chain member once: %+v", capture.calls)
	}
	if !hasNotificationFor(capture.calls, thirdID, next.ID) || !hasNotificationFor(capture.calls, ownerID, next.ID) {
		t.Fatalf("delegate notifications must reach target and original requester: %+v", capture.calls)
	}
	ownerView := e.Do("GET", "/api/v1/care-requests/"+next.ID, ownerTok, nil)
	if ownerView.Status != http.StatusOK || ownerView.Body["care_request"].(map[string]any)["id"] != next.ID {
		t.Fatalf("prior chain member must read delegated request: %d %v", ownerView.Status, ownerView.Body)
	}
	if kind := notificationKindFor(capture.calls, thirdID, next.ID); kind != "care_request" {
		t.Fatalf("next target must receive actionable care_request notification, got %q", kind)
	}
	if kind := notificationKindFor(capture.calls, ownerID, next.ID); kind != "care_handoff" {
		t.Fatalf("prior chain member must receive non-actionable care_handoff notification, got %q", kind)
	}
	if _, err := service.Delegate(context.Background(), memberID, request.ID, thirdID, "请你接手", "notify-delegate"); err != nil {
		t.Fatalf("delegate replay: %v", err)
	}
	if len(capture.calls) != 3 {
		t.Fatalf("idempotent delegate replay must not resend notification: %+v", capture.calls)
	}

	if _, err := service.Accept(context.Background(), thirdID, next.ID, "我来做", "notify-accept"); err != nil {
		t.Fatalf("accept request: %v", err)
	}
	if len(capture.calls) != 4 || capture.calls[3].userID != memberID || capture.calls[3].kind != "care_handoff" {
		t.Fatalf("accept should notify immediate handoff sender: %+v", capture.calls)
	}
	if _, err := service.Accept(context.Background(), thirdID, next.ID, "我来做", "notify-accept"); err != nil {
		t.Fatalf("accept replay: %v", err)
	}
	if len(capture.calls) != 4 {
		t.Fatalf("idempotent accept replay must not resend notification: %+v", capture.calls)
	}
	if _, err := e.Pool.Exec(context.Background(),
		`UPDATE family_memberships SET status='ended', ended_at=now() WHERE family_id=$1 AND user_id=$2`, familyID, memberID); err != nil {
		t.Fatalf("end prior member: %v", err)
	}
	endedMemberView := e.Do("GET", "/api/v1/care-requests/"+next.ID, memberTok, nil)
	if endedMemberView.Status != http.StatusNotFound {
		t.Fatalf("ended chain member must lose read access: %d %v", endedMemberView.Status, endedMemberView.Body)
	}
}

func TestAcceptedCaregiverCanHandOffWithoutDuplicateResponsibility(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-accepted-handoff", "Milo")
	firstTok, firstID, _ := e.NewUser("cr-accepted-handoff-first")
	secondTok, secondID, _ := e.NewUser("cr-accepted-handoff-second")
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET members=3 WHERE key='free'`); err != nil {
		t.Fatalf("expand test member quota: %v", err)
	}
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	for _, token := range []string{firstTok, secondTok} {
		if joined := e.Do("POST", "/api/v1/families/join", token, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
			t.Fatalf("join family: %d %v", joined.Status, joined.Body)
		}
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"可连续转交的遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	occurrenceID := created.Body["task"].(map[string]any)["id"].(string)

	firstRequest := e.doWithHeader("POST", "/api/v1/care-occurrences/"+occurrenceID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": firstID, "message": "请先帮忙遛狗",
	}, "cr-accepted-handoff-first")
	if firstRequest.Status != http.StatusCreated {
		t.Fatalf("create first request: %d %v", firstRequest.Status, firstRequest.Body)
	}
	firstRequestID := firstRequest.Body["care_request"].(map[string]any)["id"].(string)
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+firstRequestID+"/accept", firstTok, map[string]any{}, "cr-accepted-handoff-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept first request: %d %v", accepted.Status, accepted.Body)
	}

	service := careCoordServiceForTest(e, &captureNotifier{})
	next, err := service.Create(context.Background(), firstID, familyID, occurrenceID, secondID, "我现在也没时间，请你接手", "cr-accepted-handoff-next")
	if err != nil {
		t.Fatalf("create follow-up from accepted caregiver: %v", err)
	}
	var previousState string
	if err := e.Pool.QueryRow(context.Background(), `SELECT state FROM care_requests WHERE id=$1`, firstRequestID).Scan(&previousState); err != nil {
		t.Fatalf("read previous request state: %v", err)
	}
	if previousState != "delegated" || next.State != "sent" {
		t.Fatalf("handoff chain states: previous=%q next=%q", previousState, next.State)
	}

	secondAccepted := e.doWithHeader("POST", "/api/v1/care-requests/"+next.ID+"/accept", secondTok, map[string]any{}, "cr-accepted-handoff-second-accept")
	if secondAccepted.Status != http.StatusOK {
		t.Fatalf("accept follow-up request: %d %v", secondAccepted.Status, secondAccepted.Body)
	}
	var acceptedCount int
	var assignedTo string
	if err := e.Pool.QueryRow(context.Background(), `SELECT count(*) FILTER (WHERE state='accepted'), COALESCE((SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1), '') FROM care_requests WHERE occurrence_id=$1 AND deleted_at IS NULL`, occurrenceID).Scan(&acceptedCount, &assignedTo); err != nil {
		t.Fatalf("read final responsibility: %v", err)
	}
	if acceptedCount != 1 || assignedTo != secondID {
		t.Fatalf("handoff must leave one current caregiver: accepted=%d assigned=%q want=%q", acceptedCount, assignedTo, secondID)
	}
}

func hasNotificationFor(calls []capturedCareNotification, userID, requestID string) bool {
	for _, call := range calls {
		if call.userID == userID && call.data["care_request_id"] == requestID {
			return true
		}
	}
	return false
}

func notificationKindFor(calls []capturedCareNotification, userID, requestID string) string {
	for _, call := range calls {
		if call.userID == userID && call.data["care_request_id"] == requestID {
			return call.kind
		}
	}
	return ""
}

func TestCareRequestRejectsSecondOpenRequestAndUnauthorizedResponse(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-open", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-open-member")
	strangerTok, _, _ := e.NewUser("cr-open-stranger")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"早餐","schedule":{"v":1,"kind":"daily"}}`)
	taskID := created.Body["task"].(map[string]any)["id"].(string)

	first := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-open-1")
	if first.Status != http.StatusCreated {
		t.Fatalf("first request: %d %v", first.Status, first.Body)
	}
	second := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-open-2")
	if second.Status != http.StatusConflict || e.ErrorCode(second) != "CARE_REQUEST_OPEN" {
		t.Fatalf("second open request: %d %v", second.Status, second.Body)
	}

	requestID := first.Body["care_request"].(map[string]any)["id"].(string)
	unauthorizedRead := e.Do("GET", "/api/v1/care-requests/"+requestID, strangerTok, nil)
	if unauthorizedRead.Status != http.StatusNotFound {
		t.Fatalf("non-participant read: %d %v", unauthorizedRead.Status, unauthorizedRead.Body)
	}
	unauthorized := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", ownerTok, map[string]any{}, "cr-unauthorized")
	if unauthorized.Status != http.StatusNotFound {
		t.Fatalf("unauthorized response: %d %v", unauthorized.Status, unauthorized.Body)
	}
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-open-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept first request: %d %v", accepted.Status, accepted.Body)
	}
	ownerBypass := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-open-after-accept")
	if ownerBypass.Status != http.StatusConflict || e.ErrorCode(ownerBypass) != "CARE_OCCURRENCE_ASSIGNED" {
		t.Fatalf("assigned occurrence bypass: %d %v", ownerBypass.Status, ownerBypass.Body)
	}
}

func TestCareRequestDeclineCanReassignAndReplay(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-reassign", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-reassign-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚间喂药","schedule":{"v":1,"kind":"daily"}}`)
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-reassign-create")
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	declined := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/decline", memberTok,
		map[string]any{"note": "我今晚不在家"}, "cr-reassign-decline")
	if declined.Status != http.StatusOK || declined.Body["care_request"].(map[string]any)["state"] != "declined" {
		t.Fatalf("decline: %d %v", declined.Status, declined.Body)
	}

	reassigned := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/reassign", memberTok, map[string]any{
		"target_user_id": ownerID, "message": "请原发起人继续安排",
	}, "cr-reassign-next")
	if reassigned.Status != http.StatusCreated {
		t.Fatalf("reassign: %d %v", reassigned.Status, reassigned.Body)
	}
	next := reassigned.Body["care_request"].(map[string]any)
	nextID := next["id"].(string)
	if next["state"] != "sent" || next["target_user_id"] != ownerID {
		t.Fatalf("unexpected reassigned request: %v", next)
	}

	replay := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/reassign", memberTok, map[string]any{
		"target_user_id": ownerID, "message": "请原发起人继续安排",
	}, "cr-reassign-next")
	if replay.Status != http.StatusCreated || replay.Body["care_request"].(map[string]any)["id"] != nextID {
		t.Fatalf("reassign replay: %d %v", replay.Status, replay.Body)
	}

	inbox := e.Do("GET", "/api/v1/care-requests/inbox", ownerTok, nil)
	if inbox.Status != http.StatusOK || len(inbox.Body["care_requests"].([]any)) != 1 {
		t.Fatalf("owner inbox after reassign: %d %v", inbox.Status, inbox.Body)
	}
}

func TestCareRequestDoesNotReuseDeclinedTargetAcrossHandoffPaths(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-no-reuse", "Milo")
	firstTok, firstID, _ := e.NewUser("cr-no-reuse-first")
	secondTok, secondID, _ := e.NewUser("cr-no-reuse-second")
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET members=3 WHERE key='free'`); err != nil {
		t.Fatalf("expand test member quota: %v", err)
	}
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	for _, token := range []string{firstTok, secondTok} {
		if joined := e.Do("POST", "/api/v1/families/join", token, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
			t.Fatalf("join family: %d %v", joined.Status, joined.Body)
		}
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"不可重复指定","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	occurrenceID := created.Body["task"].(map[string]any)["id"].(string)

	first := e.doWithHeader("POST", "/api/v1/care-occurrences/"+occurrenceID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": firstID,
	}, "cr-no-reuse-first")
	if first.Status != http.StatusCreated {
		t.Fatalf("create first request: %d %v", first.Status, first.Body)
	}
	firstRequestID := first.Body["care_request"].(map[string]any)["id"].(string)
	declined := e.doWithHeader("POST", "/api/v1/care-requests/"+firstRequestID+"/decline", firstTok,
		map[string]any{"note": "今晚不在家"}, "cr-no-reuse-decline")
	if declined.Status != http.StatusOK {
		t.Fatalf("decline first request: %d %v", declined.Status, declined.Body)
	}

	directReuse := e.doWithHeader("POST", "/api/v1/care-occurrences/"+occurrenceID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": firstID,
	}, "cr-no-reuse-direct")
	if directReuse.Status != http.StatusConflict || e.ErrorCode(directReuse) != "CARE_REQUEST_TARGET_PREVIOUSLY_DECLINED" {
		t.Fatalf("direct request must reject a previously declined target: %d %v", directReuse.Status, directReuse.Body)
	}

	toSecond := e.doWithHeader("POST", "/api/v1/care-occurrences/"+occurrenceID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": secondID,
	}, "cr-no-reuse-second")
	if toSecond.Status != http.StatusCreated {
		t.Fatalf("create second request: %d %v", toSecond.Status, toSecond.Body)
	}
	secondRequestID := toSecond.Body["care_request"].(map[string]any)["id"].(string)
	delegatedReuse := e.doWithHeader("POST", "/api/v1/care-requests/"+secondRequestID+"/delegate", secondTok, map[string]any{
		"target_user_id": firstID, "message": "请你再接手一次",
	}, "cr-no-reuse-delegate")
	if delegatedReuse.Status != http.StatusConflict || e.ErrorCode(delegatedReuse) != "CARE_REQUEST_TARGET_PREVIOUSLY_DECLINED" {
		t.Fatalf("delegation must reject a previously declined target: %d %v", delegatedReuse.Status, delegatedReuse.Body)
	}

	var state string
	if err := e.Pool.QueryRow(context.Background(), `SELECT state FROM care_requests WHERE id=$1`, secondRequestID).Scan(&state); err != nil {
		t.Fatalf("read unchanged delegated request: %v", err)
	}
	if state != "sent" {
		t.Fatalf("rejected delegation must leave current request open, got %q", state)
	}
}

func TestCareHandoffBatchDoesNotReuseDeclinedTarget(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-batch-no-reuse", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-batch-no-reuse-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"批量不可重复指定","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create care plan: %d %v", created.Status, created.Body)
	}
	occurrenceID := created.Body["task"].(map[string]any)["id"].(string)
	batch := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID, "occurrence_ids": []string{occurrenceID},
	}, "cr-batch-no-reuse-first")
	if batch.Status != http.StatusCreated {
		t.Fatalf("create first batch: %d %v", batch.Status, batch.Body)
	}
	batchID := batch.Body["batch"].(map[string]any)["id"].(string)
	declined := e.doWithHeader("POST", "/api/v1/care-handoff-batches/"+batchID+"/decline", memberTok, map[string]any{}, "cr-batch-no-reuse-decline")
	if declined.Status != http.StatusOK {
		t.Fatalf("decline first batch: %d %v", declined.Status, declined.Body)
	}

	reused := e.doWithHeader("POST", "/api/v1/families/"+familyID+"/care-handoff-batches", ownerTok, map[string]any{
		"target_user_id": memberID, "occurrence_ids": []string{occurrenceID},
	}, "cr-batch-no-reuse-second")
	if reused.Status != http.StatusConflict || e.ErrorCode(reused) != "CARE_REQUEST_TARGET_PREVIOUSLY_DECLINED" {
		t.Fatalf("batch request must reject a previously declined target: %d %v", reused.Status, reused.Body)
	}
}

func TestCareCompletionNotifiesRequestChainOnce(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-complete", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-complete-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚间遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-complete-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-complete-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept request: %d %v", accepted.Status, accepted.Body)
	}

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ops := app.NewProactiveOps(e.Pool, log, &email.DevSender{Log: log})
	recipients, err := ops.Tasks.Repo.CareCompletionRecipients(context.Background(), e.Pool, taskID, memberID)
	if err != nil || len(recipients) != 1 || recipients[0].UserID != ownerID {
		t.Fatalf("completion recipients: %v %+v", err, recipients)
	}
	capture := &captureNotifier{}
	ops.Tasks.Notifier = capture
	if _, err := ops.Tasks.CompleteTaskWithIdempotency(context.Background(), taskID, memberID, "done", "", "", time.Now(), "cr-complete-once"); err != nil {
		t.Fatalf("complete task: %v", err)
	}
	if _, err := ops.Tasks.CompleteTaskWithIdempotency(context.Background(), taskID, memberID, "done", "", "", time.Now(), "cr-complete-once"); err != nil {
		t.Fatalf("replay completion: %v", err)
	}
	if len(capture.calls) != 1 {
		t.Fatalf("completion notification calls=%d, want 1: %+v", len(capture.calls), capture.calls)
	}
	call := capture.calls[0]
	if call.userID != ownerID || call.kind != "care_completed" || call.data["occurrence_id"] != taskID {
		t.Fatalf("completion notification: %+v", call)
	}
}

func TestCareCompletionCancelsOpenRequestAndNotifiesTarget(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-complete-open", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-complete-open-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"先完成再通知","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID, "message": "如果我没完成再请你接手",
	}, "cr-complete-open-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	capture := &captureNotifier{}
	ops := app.NewProactiveOps(e.Pool, slog.New(slog.NewTextHandler(io.Discard, nil)), &email.DevSender{Log: slog.Default()})
	ops.Tasks.Notifier = capture
	if _, err := ops.Tasks.CompleteTaskWithIdempotency(context.Background(), taskID, ownerID, "done", "", "", time.Now(), "cr-complete-open-done"); err != nil {
		t.Fatalf("complete occurrence: %v", err)
	}
	var state string
	if err := e.Pool.QueryRow(context.Background(), `SELECT state FROM care_requests WHERE id=$1`, requestID).Scan(&state); err != nil {
		t.Fatalf("read request state: %v", err)
	}
	if state != "cancelled" {
		t.Fatalf("completed occurrence must cancel open request, state=%q", state)
	}
	if len(capture.calls) != 1 || capture.calls[0].userID != memberID || capture.calls[0].kind != "care_handoff" {
		t.Fatalf("target must receive non-actionable cancellation feedback: %+v", capture.calls)
	}
	if !strings.HasPrefix(capture.calls[0].body, "照护已由 ") || !strings.Contains(capture.calls[0].body, " 完成：先完成再通知") {
		t.Fatalf("cancellation feedback must name the executor: %+v", capture.calls[0])
	}
	accept := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-complete-open-accept")
	if accept.Status != http.StatusConflict || e.ErrorCode(accept) != "CARE_REQUEST_NOT_ACTIONABLE" {
		t.Fatalf("cancelled request must reject accept: %d %v", accept.Status, accept.Body)
	}
	var action string
	if err := e.Pool.QueryRow(context.Background(), `SELECT action FROM care_request_events WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1`, requestID).Scan(&action); err != nil {
		t.Fatalf("read cancellation event: %v", err)
	}
	if action != "cancelled" {
		t.Fatalf("cancellation event action=%q", action)
	}
}

func TestCareRequestTargetMustRespondBeforeCompleting(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-response-first", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-response-first-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"先回应再完成","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	if _, err := e.Pool.Exec(context.Background(), `UPDATE care_occurrences SET assigned_to_user_id=NULL WHERE id=$1`, taskID); err != nil {
		t.Fatalf("make occurrence shared before request: %v", err)
	}
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-response-first-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	direct := e.doWithHeader("POST", "/api/v1/care-tasks/"+taskID+"/complete", memberTok,
		map[string]any{"status": "done"}, "cr-response-first-direct-complete")
	if direct.Status != http.StatusConflict || e.ErrorCode(direct) != "CARE_REQUEST_RESPONSE_REQUIRED" {
		t.Fatalf("target must respond before completing: %d %v", direct.Status, direct.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-response-first-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept request: %d %v", accepted.Status, accepted.Body)
	}
	ownerBypass := e.doWithHeader("POST", "/api/v1/care-tasks/"+taskID+"/complete", ownerTok,
		map[string]any{"status": "done"}, "cr-response-first-owner-bypass")
	if ownerBypass.Status != http.StatusConflict || e.ErrorCode(ownerBypass) != "CARE_OCCURRENCE_ASSIGNED" {
		t.Fatalf("previous owner must not complete after handoff: %d %v", ownerBypass.Status, ownerBypass.Body)
	}
	completed := e.doWithHeader("POST", "/api/v1/care-tasks/"+taskID+"/complete", memberTok,
		map[string]any{"status": "done"}, "cr-response-first-complete")
	if completed.Status != http.StatusCreated {
		t.Fatalf("complete after accept: %d %v", completed.Status, completed.Body)
	}
	var state, assigned string
	if err := e.Pool.QueryRow(context.Background(), `SELECT r.state, COALESCE(co.assigned_to_user_id::text,'') FROM care_requests r JOIN care_occurrences co ON co.id=r.occurrence_id WHERE r.id=$1`, requestID).Scan(&state, &assigned); err != nil {
		t.Fatalf("read accepted responsibility: %v", err)
	}
	if state != "accepted" || assigned != memberID {
		t.Fatalf("response and responsibility must be explicit: state=%q assigned=%q", state, assigned)
	}
}

func TestCareRequestExpiresBeforeItCanBeAccepted(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-expire", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-expire-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"早晨喂药","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	if _, err := e.Pool.Exec(context.Background(),
		`UPDATE care_occurrences SET due_at=$2, assigned_to_user_id=NULL WHERE id=$1`, taskID, time.Now().Add(-time.Minute)); err != nil {
		t.Fatalf("age occurrence: %v", err)
	}
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-expire-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	capture := &captureNotifier{}
	service := careCoordServiceForTest(e, capture)
	expired, err := service.ExpireDueForFamily(context.Background(), familyID, time.Now())
	if err != nil || expired != 1 {
		t.Fatalf("expire due request: count=%d err=%v", expired, err)
	}
	if len(capture.calls) != 2 {
		t.Fatalf("expiry should notify requester and target: %+v", capture.calls)
	}
	for _, call := range capture.calls {
		if (call.userID != ownerID && call.userID != memberID) || call.kind != "care_handoff" {
			t.Fatalf("expiry notifications must be non-actionable status receipts: %+v", capture.calls)
		}
	}
	got := e.Do("GET", "/api/v1/care-requests/"+requestID, memberTok, nil)
	if got.Status != http.StatusOK || got.Body["care_request"].(map[string]any)["state"] != "expired" {
		t.Fatalf("expired request projection: %d %v", got.Status, got.Body)
	}
	accept := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-expire-accept")
	if accept.Status != http.StatusConflict || e.ErrorCode(accept) != "CARE_REQUEST_NOT_ACTIONABLE" {
		t.Fatalf("expired request must reject accept: %d %v", accept.Status, accept.Body)
	}
	var action string
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT action FROM care_request_events WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1`, requestID).Scan(&action); err != nil {
		t.Fatalf("read expiry event: %v", err)
	}
	if action != "expired" {
		t.Fatalf("expiry event action=%q", action)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	scheduler := app.NewScheduler(e.Pool, log, &email.DevSender{Log: log})
	risks, err := scheduler.Risks.UnassignedCareRisks(context.Background(), familyID, time.Now())
	if err != nil {
		t.Fatalf("read expired escalation risk: %v", err)
	}
	var failedRisk bool
	for _, risk := range risks {
		if risk.OccurrenceID == taskID {
			failedRisk = risk.EscalationFailed
		}
	}
	if !failedRisk {
		t.Fatalf("expired request must remain an escalation risk: %+v", risks)
	}
}

func TestCareRequestAcceptAndExpiryHaveOneWinner(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, familyID, petID := e.SetupFamily("cr-race", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-race-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚间喂食","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	if _, err := e.Pool.Exec(context.Background(),
		`UPDATE care_occurrences SET due_at=$2, assigned_to_user_id=NULL WHERE id=$1`, taskID, time.Now().Add(-time.Minute)); err != nil {
		t.Fatalf("age occurrence: %v", err)
	}
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-race-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	scheduler := app.NewScheduler(e.Pool, log, &email.DevSender{Log: log})
	start := make(chan struct{})
	var wg sync.WaitGroup
	var accepted *Resp
	var expired int
	var expireErr error
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		accepted = e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-race-accept")
	}()
	go func() {
		defer wg.Done()
		<-start
		expired, expireErr = scheduler.CareRequests.ExpireDueForFamily(context.Background(), familyID, time.Now())
	}()
	close(start)
	wg.Wait()
	if expireErr != nil {
		t.Fatalf("expire race: %v", expireErr)
	}
	if accepted.Status != http.StatusOK && accepted.Status != http.StatusConflict {
		t.Fatalf("accept race status: %d %v", accepted.Status, accepted.Body)
	}
	if expired > 1 {
		t.Fatalf("expiry race expired=%d", expired)
	}
	var state, assigned string
	if err := e.Pool.QueryRow(context.Background(),
		`SELECT r.state, COALESCE(co.assigned_to_user_id::text,'') FROM care_requests r JOIN care_occurrences co ON co.id=r.occurrence_id WHERE r.id=$1`, requestID).Scan(&state, &assigned); err != nil {
		t.Fatalf("read race result: %v", err)
	}
	switch state {
	case "accepted":
		if assigned != memberID || accepted.Status != http.StatusOK {
			t.Fatalf("accepted state inconsistent: assigned=%q response=%d", assigned, accepted.Status)
		}
	case "expired":
		if assigned != "" || accepted.Status != http.StatusConflict {
			t.Fatalf("expired state inconsistent: assigned=%q response=%d", assigned, accepted.Status)
		}
	default:
		t.Fatalf("unexpected race state=%q assigned=%q", state, assigned)
	}
}

func TestCareRequestAcceptAndCompletionHaveOneWinner(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-complete-race", "Milo")
	memberTok, memberID, _ := e.NewUser("cr-complete-race-member")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", memberTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"接手与完成竞态","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	taskID := created.Body["task"].(map[string]any)["id"].(string)
	requested := e.doWithHeader("POST", "/api/v1/care-occurrences/"+taskID+"/requests", ownerTok, map[string]any{
		"family_id": familyID, "target_user_id": memberID,
	}, "cr-complete-race-request")
	if requested.Status != http.StatusCreated {
		t.Fatalf("create request: %d %v", requested.Status, requested.Body)
	}
	requestID := requested.Body["care_request"].(map[string]any)["id"].(string)
	start := make(chan struct{})
	var wg sync.WaitGroup
	var accepted, completed *Resp
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		accepted = e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", memberTok, map[string]any{}, "cr-complete-race-accept")
	}()
	go func() {
		defer wg.Done()
		<-start
		completed = e.doWithHeader("POST", "/api/v1/care-tasks/"+taskID+"/complete", ownerTok,
			map[string]any{"status": "done"}, "cr-complete-race-complete")
	}()
	close(start)
	wg.Wait()
	if accepted.Status != http.StatusOK && accepted.Status != http.StatusConflict {
		t.Fatalf("accept race status: %d %v", accepted.Status, accepted.Body)
	}
	if completed.Status != http.StatusCreated && completed.Status != http.StatusConflict {
		t.Fatalf("completion race status: %d %v", completed.Status, completed.Body)
	}
	var state, assigned, occurrenceStatus string
	if err := e.Pool.QueryRow(context.Background(), `SELECT r.state, COALESCE(co.assigned_to_user_id::text,''), co.status FROM care_requests r JOIN care_occurrences co ON co.id=r.occurrence_id WHERE r.id=$1`, requestID).Scan(&state, &assigned, &occurrenceStatus); err != nil {
		t.Fatalf("read completion race: %v", err)
	}
	switch state {
	case "accepted":
		if accepted.Status != http.StatusOK || assigned != memberID || completed.Status != http.StatusConflict || e.ErrorCode(completed) != "CARE_OCCURRENCE_ASSIGNED" {
			t.Fatalf("accept winner inconsistent: state=%q assigned=%q occurrence=%q accept=%d complete=%d", state, assigned, occurrenceStatus, accepted.Status, completed.Status)
		}
	case "cancelled":
		if completed.Status != http.StatusCreated || accepted.Status != http.StatusConflict || e.ErrorCode(accepted) != "CARE_REQUEST_NOT_ACTIONABLE" || occurrenceStatus != "completed" {
			t.Fatalf("completion winner inconsistent: state=%q assigned=%q occurrence=%q accept=%d complete=%d", state, assigned, occurrenceStatus, accepted.Status, completed.Status)
		}
	default:
		t.Fatalf("unexpected completion race state=%q assigned=%q occurrence=%q", state, assigned, occurrenceStatus)
	}
	if assigned != "" && assigned != ownerID && assigned != memberID {
		t.Fatalf("unexpected assigned user %q", assigned)
	}
}

func TestCareRequestAutoEscalatesToConfiguredHelper(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-auto", "Milo")
	helperTok, helperID, _ := e.NewUser("cr-auto-helper")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	if joined := e.Do("POST", "/api/v1/families/join", helperTok, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
		t.Fatalf("join family: %d %v", joined.Status, joined.Body)
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"晚餐喂食","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	task := created.Body["task"].(map[string]any)
	taskID := task["id"].(string)
	planID, _ := task["care_plan_id"].(string)
	if planID == "" {
		if err := e.Pool.QueryRow(context.Background(), `SELECT care_plan_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&planID); err != nil {
			t.Fatalf("read plan id: %v", err)
		}
	}
	if assigned := e.Do("PUT", "/api/v1/care-plans/"+planID+"/assignments/"+helperID, ownerTok, map[string]any{"role": "helper"}); assigned.Status != http.StatusOK {
		t.Fatalf("configure helper: %d %v", assigned.Status, assigned.Body)
	}
	now := time.Now()
	if _, err := e.Pool.Exec(context.Background(),
		`UPDATE care_occurrences SET due_at=$2, assigned_to_user_id=$3 WHERE id=$1`, taskID, now.Add(10*time.Minute), ownerID); err != nil {
		t.Fatalf("move occurrence near due: %v", err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	scheduler := app.NewScheduler(e.Pool, log, &email.DevSender{Log: log})
	escalated, err := scheduler.CareRequests.EscalateForFamily(context.Background(), familyID, now)
	if err != nil || escalated != 1 {
		t.Fatalf("auto escalation: count=%d err=%v", escalated, err)
	}
	inbox := e.Do("GET", "/api/v1/care-requests/inbox", helperTok, nil)
	if inbox.Status != http.StatusOK {
		t.Fatalf("helper inbox: %d %v", inbox.Status, inbox.Body)
	}
	items := inbox.Body["care_requests"].([]any)
	if len(items) != 1 {
		t.Fatalf("helper inbox items: %v", inbox.Body)
	}
	requestID := items[0].(map[string]any)["id"].(string)
	if items[0].(map[string]any)["message"] != "当前负责人还没完成，请你确认是否能做。" {
		t.Fatalf("auto escalation message: %v", items[0])
	}
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+requestID+"/accept", helperTok, map[string]any{}, "cr-auto-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("accept auto escalation: %d %v", accepted.Status, accepted.Body)
	}
	var currentOwner string
	if err := e.Pool.QueryRow(context.Background(), `SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&currentOwner); err != nil {
		t.Fatalf("read current owner: %v", err)
	}
	if currentOwner != helperID {
		t.Fatalf("current owner=%q want helper %q", currentOwner, helperID)
	}
	if repeated, err := scheduler.CareRequests.EscalateForFamily(context.Background(), familyID, now); err != nil || repeated != 0 {
		t.Fatalf("accepted occurrence must not escalate again: count=%d err=%v", repeated, err)
	}
}

func TestCareRequestAutoEscalatesThroughMultipleHelpers(t *testing.T) {
	e := NewEnv(t)
	ownerTok, ownerID, familyID, petID := e.SetupFamily("cr-auto-chain", "Milo")
	firstTok, firstID, _ := e.NewUser("cr-auto-chain-first")
	secondTok, secondID, _ := e.NewUser("cr-auto-chain-second")
	invite := e.Do("POST", "/api/v1/families/"+familyID+"/invite/refresh", ownerTok, nil)
	// 该用例专门验证第二级备用成员；测试数据库默认 free 档位为 2 人，
	// 只在本测试 fixture 中放宽到 3 人，不改变生产配额语义。
	if _, err := e.Pool.Exec(context.Background(), `UPDATE plans SET members=3 WHERE key='free'`); err != nil {
		t.Fatalf("expand test member quota: %v", err)
	}
	for _, token := range []string{firstTok, secondTok} {
		if joined := e.Do("POST", "/api/v1/families/join", token, map[string]any{"code": invite.Body["invite_code"]}); joined.Status != http.StatusOK {
			t.Fatalf("join family: %d %v", joined.Status, joined.Body)
		}
	}
	created := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", ownerTok,
		`{"title":"夜间遛狗","schedule":{"v":1,"kind":"daily"}}`)
	if created.Status != http.StatusCreated {
		t.Fatalf("create task: %d %v", created.Status, created.Body)
	}
	task := created.Body["task"].(map[string]any)
	taskID := task["id"].(string)
	planID, _ := task["care_plan_id"].(string)
	if planID == "" {
		if err := e.Pool.QueryRow(context.Background(), `SELECT care_plan_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&planID); err != nil {
			t.Fatalf("read plan id: %v", err)
		}
	}
	for _, helperID := range []string{firstID, secondID} {
		if assigned := e.Do("PUT", "/api/v1/care-plans/"+planID+"/assignments/"+helperID, ownerTok, map[string]any{"role": "helper"}); assigned.Status != http.StatusOK {
			t.Fatalf("configure helper %s: %d %v", helperID, assigned.Status, assigned.Body)
		}
	}
	now := time.Now()
	if _, err := e.Pool.Exec(context.Background(),
		`UPDATE care_occurrences SET due_at=$2, assigned_to_user_id=$3 WHERE id=$1`, taskID, now.Add(10*time.Minute), ownerID); err != nil {
		t.Fatalf("move occurrence near due: %v", err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	scheduler := app.NewScheduler(e.Pool, log, &email.DevSender{Log: log})
	if count, err := scheduler.CareRequests.EscalateForFamily(context.Background(), familyID, now); err != nil || count != 1 {
		t.Fatalf("first auto escalation: count=%d err=%v", count, err)
	}
	firstInbox := e.Do("GET", "/api/v1/care-requests/inbox", firstTok, nil)
	if firstInbox.Status != http.StatusOK || len(firstInbox.Body["care_requests"].([]any)) != 1 {
		t.Fatalf("first helper inbox: %d %v", firstInbox.Status, firstInbox.Body)
	}
	firstRequestID := firstInbox.Body["care_requests"].([]any)[0].(map[string]any)["id"].(string)
	declined := e.doWithHeader("POST", "/api/v1/care-requests/"+firstRequestID+"/decline", firstTok, map[string]any{"note": "今晚不在家"}, "cr-auto-chain-decline")
	if declined.Status != http.StatusOK {
		t.Fatalf("first helper decline: %d %v", declined.Status, declined.Body)
	}
	if count, err := scheduler.CareRequests.EscalateForFamily(context.Background(), familyID, now); err != nil || count != 1 {
		t.Fatalf("second auto escalation: count=%d err=%v", count, err)
	}
	secondInbox := e.Do("GET", "/api/v1/care-requests/inbox", secondTok, nil)
	if secondInbox.Status != http.StatusOK || len(secondInbox.Body["care_requests"].([]any)) != 1 {
		t.Fatalf("second helper inbox: %d %v", secondInbox.Status, secondInbox.Body)
	}
	secondRequestID := secondInbox.Body["care_requests"].([]any)[0].(map[string]any)["id"].(string)
	secondRequest := secondInbox.Body["care_requests"].([]any)[0].(map[string]any)
	if secondRequest["supersedes_request_id"] != firstRequestID {
		t.Fatalf("second automatic escalation must continue the request chain: %v", secondRequest)
	}
	accepted := e.doWithHeader("POST", "/api/v1/care-requests/"+secondRequestID+"/accept", secondTok, map[string]any{}, "cr-auto-chain-accept")
	if accepted.Status != http.StatusOK {
		t.Fatalf("second helper accept: %d %v", accepted.Status, accepted.Body)
	}
	var currentOwner string
	if err := e.Pool.QueryRow(context.Background(), `SELECT assigned_to_user_id::text FROM care_occurrences WHERE id=$1`, taskID).Scan(&currentOwner); err != nil {
		t.Fatalf("read chained owner: %v", err)
	}
	if currentOwner != secondID {
		t.Fatalf("chained owner=%q want second helper %q", currentOwner, secondID)
	}
}
