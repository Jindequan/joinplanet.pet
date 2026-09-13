package notify

import (
	"testing"

	"github.com/joinplanet/planet-api/internal/contracts"
)

func TestDeliveryFailureRetriesOnlyWhenNobodyReceived(t *testing.T) {
	failures := []contracts.RecipientError{{To: "a@example.com", Error: "provider down"}}
	if err := deliveryFailure("reminder", 0, failures); err == nil {
		t.Fatal("an all-recipient failure must be retried")
	}
	if err := deliveryFailure("reminder", 1, failures); err != nil {
		t.Fatalf("a partial delivery must not retry successful recipients: %v", err)
	}
	if err := deliveryFailure("reminder", 0, nil); err != nil {
		t.Fatalf("an empty recipient set is not a delivery failure: %v", err)
	}
}
