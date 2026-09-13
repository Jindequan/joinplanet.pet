package integration

import (
	"net/http"
	"testing"
)

func TestPetAccessGrantLifecycle(t *testing.T) {
	e := NewEnv(t)
	ownerTok, _, _, petID := e.SetupFamily("grant", "Milo")
	viewerTok, viewerID, _ := e.NewUser("grant-viewer")

	if r := e.Do("GET", "/api/v1/pets/"+petID, viewerTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("ungranted user should not see pet: %d", r.Status)
	}
	created := e.Do("POST", "/api/v1/pets/"+petID+"/access-grants", ownerTok, map[string]any{
		"user_id": viewerID, "role": "viewer",
	})
	if created.Status != http.StatusCreated {
		t.Fatalf("grant viewer: %d %v", created.Status, created.Body)
	}
	grantID := created.Body["grant"].(map[string]any)["id"].(string)
	if r := e.Do("GET", "/api/v1/pets/"+petID, viewerTok, nil); r.Status != http.StatusOK {
		t.Fatalf("viewer should see granted pet: %d %v", r.Status, r.Body)
	}
	if r := e.DoJSON("POST", "/api/v1/pets/"+petID+"/tasks", viewerTok,
		`{"title":"不应写入","schedule":{"v":1,"kind":"daily"}}`); r.Status != http.StatusForbidden {
		t.Fatalf("viewer should not write: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/pets/"+petID+"/export", viewerTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("viewer should not export complete pet history: %d %v", r.Status, r.Body)
	}
	if r := e.Do("DELETE", "/api/v1/pets/"+petID+"/access-grants/"+grantID, viewerTok, nil); r.Status != http.StatusForbidden {
		t.Fatalf("viewer should not revoke: %d", r.Status)
	}
	if r := e.Do("DELETE", "/api/v1/pets/"+petID+"/access-grants/"+grantID, ownerTok, nil); r.Status != http.StatusNoContent {
		t.Fatalf("owner revoke: %d %v", r.Status, r.Body)
	}
	if r := e.Do("GET", "/api/v1/pets/"+petID, viewerTok, nil); r.Status != http.StatusNotFound {
		t.Fatalf("revoked grant should lose access: %d", r.Status)
	}
}
