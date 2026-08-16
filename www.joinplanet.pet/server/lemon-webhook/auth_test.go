package main

// auth_test.go — pure logic tests for the auth module (no database).

import (
	"encoding/hex"
	"testing"
)

func TestGenerateLoginCodeShape(t *testing.T) {
	for i := 0; i < 50; i++ {
		code, err := generateLoginCode()
		if err != nil {
			t.Fatalf("generateLoginCode: %v", err)
		}
		if len(code) != 6 {
			t.Fatalf("code %q: want 6 characters", code)
		}
		for _, c := range code {
			if c < '0' || c > '9' {
				t.Fatalf("code %q: non-digit %q", code, c)
			}
		}
	}
}

func TestGenerateLoginCodeVaries(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		code, err := generateLoginCode()
		if err != nil {
			t.Fatalf("generateLoginCode: %v", err)
		}
		seen[code] = true
	}
	if len(seen) < 2 {
		t.Fatal("codes should vary across calls")
	}
}

func TestLoginCodeHashBinding(t *testing.T) {
	email, code := "dev@joinplanet.pet", "042913"
	want := sha256Hex(email + ":" + code)
	if got := loginCodeHash(email, code); got != want {
		t.Fatalf("loginCodeHash = %q, want %q", got, want)
	}
	// Hash binds email and code: neither may vary freely.
	if loginCodeHash("a@x.com", code) == want {
		t.Fatal("hash must change with email")
	}
	if loginCodeHash(email, "042914") == want {
		t.Fatal("hash must change with code")
	}
}

func TestNewSessionTokenShape(t *testing.T) {
	token, err := newSessionToken()
	if err != nil {
		t.Fatalf("newSessionToken: %v", err)
	}
	if len(token) != 64 {
		t.Fatalf("token %q: want 64 hex characters", token)
	}
	if _, err := hex.DecodeString(token); err != nil {
		t.Fatalf("token %q: not valid hex: %v", token, err)
	}
}

func TestNewSessionTokenVaries(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 20; i++ {
		token, err := newSessionToken()
		if err != nil {
			t.Fatalf("newSessionToken: %v", err)
		}
		if seen[token] {
			t.Fatalf("token repeated: %q", token)
		}
		seen[token] = true
	}
}

func TestEmailLocalPart(t *testing.T) {
	cases := map[string]string{
		"dev@joinplanet.pet": "dev",
		"a.b+tag@c.com":      "a.b+tag",
		"noatsign":           "noatsign",
		"@leading":           "@leading",
	}
	for in, want := range cases {
		if got := emailLocalPart(in); got != want {
			t.Fatalf("emailLocalPart(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidEmail(t *testing.T) {
	valid := []string{"dev@joinplanet.pet", "a.b+tag@example.co"}
	for _, email := range valid {
		if !validEmail(email) {
			t.Fatalf("validEmail(%q) = false, want true", email)
		}
	}
	invalid := []string{"", "nope", "a@b", "a@.com", "a@com.", "@x.com"}
	for _, email := range invalid {
		if validEmail(email) {
			t.Fatalf("validEmail(%q) = true, want false", email)
		}
	}
}
