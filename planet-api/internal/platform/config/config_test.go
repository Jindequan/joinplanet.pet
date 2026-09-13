package config

import "testing"

func TestLoadUsesLocalWebCorsDefaults(t *testing.T) {
	t.Setenv("PLANET_ENV", "dev")
	t.Setenv("DATABASE_URL", "postgres:///planet")
	t.Setenv("CORS_ORIGINS", "")

	c, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	for _, want := range []string{
		"http://localhost:4173",
		"http://127.0.0.1:4173",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
	} {
		found := false
		for _, got := range c.CORSOrigins {
			if got == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("CORSOrigins missing %q: %v", want, c.CORSOrigins)
		}
	}
}

func TestLoadRejectsUnknownEnv(t *testing.T) {
	t.Setenv("PLANET_ENV", "production") // 拼错/未识别的值必须启动失败，不能静默按 dev 降级
	t.Setenv("DATABASE_URL", "postgres:///planet")
	if _, err := Load(); err == nil {
		t.Fatal("Load() must reject unknown PLANET_ENV")
	}

	t.Setenv("PLANET_ENV", "prod")
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("BASE_URL", "https://app.example.test")
	t.Setenv("CORS_ORIGINS", "https://www.joinplanet.pet,https://app.joinplanet.pet")
	t.Setenv("BIND", "127.0.0.1:8081")
	if _, err := Load(); err != nil {
		t.Fatalf("prod must load: %v", err)
	}
}

func TestLoadRejectsUnsafeProductionPosture(t *testing.T) {
	t.Setenv("PLANET_ENV", "prod")
	t.Setenv("DATABASE_URL", "postgres:///planet")
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("CORS_ORIGINS", "https://www.joinplanet.pet,https://app.joinplanet.pet")
	t.Setenv("BASE_URL", "https://app.example.test")
	t.Setenv("BIND", "0.0.0.0:8081")
	if _, err := Load(); err == nil {
		t.Fatal("prod must reject non-loopback BIND")
	}

	t.Setenv("BIND", "127.0.0.1:8081")
	t.Setenv("BASE_URL", "http://app.example.test")
	if _, err := Load(); err == nil {
		t.Fatal("prod must reject non-HTTPS BASE_URL")
	}
}

func TestLoadRejectsProductionCorsMissingAppOrigin(t *testing.T) {
	t.Setenv("PLANET_ENV", "prod")
	t.Setenv("DATABASE_URL", "postgres:///planet")
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("BASE_URL", "https://api.joinplanet.pet")
	t.Setenv("CORS_ORIGINS", "https://www.joinplanet.pet")
	t.Setenv("BIND", "127.0.0.1:8081")
	if _, err := Load(); err == nil {
		t.Fatal("prod must reject CORS without app.joinplanet.pet")
	}
}

func TestLoadRejectsWildcardAndCredentialedProductionCors(t *testing.T) {
	t.Setenv("PLANET_ENV", "prod")
	t.Setenv("DATABASE_URL", "postgres:///planet")
	t.Setenv("RESEND_API_KEY", "re_test")
	t.Setenv("BASE_URL", "https://app.example.test")
	t.Setenv("BIND", "127.0.0.1:8081")

	for _, origin := range []string{
		"https://*.example.test",
		"https://user:password@app.example.test",
	} {
		t.Setenv("CORS_ORIGINS", origin)
		if _, err := Load(); err == nil {
			t.Fatalf("prod must reject unsafe CORS origin %q", origin)
		}
	}
}
