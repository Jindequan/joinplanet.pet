import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer(
  http.get("/api/v1/test-resource", () => HttpResponse.json({ ok: true })),
  http.get("/api/v1/me", () =>
    HttpResponse.json({
      user: {
        id: "user-1",
        email: "care@example.com",
        display_name: "Caregiver",
        locale: "en",
      },
      entitlements: [],
    }),
  ),
);
