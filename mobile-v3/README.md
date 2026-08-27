# PLANET App — API-driven frontend

The web/PWA frontend for PLANET. It talks to `planet-api`; the production entry does not contain local users, families, pets, tasks, or timeline fixtures.

## Run

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
npm run dev
```

Set `VITE_PLANET_API_URL` to the API `/api/v1` root. For local development:

```env
VITE_PLANET_API_URL=http://localhost:8081/api/v1
VITE_ENABLE_DEV_AUTH_CODE=false
```

The app includes real API-backed auth, account preferences and deletion, session management, family creation/join/detail/governance, pet records and lifecycle with deleted-pet restore, care plans and assignments, Today completion/skip/undo with offline pending sync, cursor-paginated timelines, medication lifecycle, private shares, family notification preferences, digest/alerts, ownership transfers, and anonymous read-only share views.

The first `npm run test:e2e` run downloads the Playwright Chromium browser if it is not already installed. Production does not expose media upload controls because the API has no media contract yet; the pet avatar remains a decorative, non-user-uploaded mark.
