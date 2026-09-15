import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";

// Spin up `next start` on an ephemeral port and fetch the rendered HTML.
// `npm run build` must run before this test (see the CI flow).
const PORT = String(4321 + (process.pid % 1000));

async function startServer() {
  // Use the installed binary directly. `npx` may perform a registry lookup on
  // a clean CI runner even though Next is already present, delaying the local
  // render smoke test indefinitely.
  const child = spawn("./node_modules/.bin/next", ["start", "-p", PORT], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const origin = `http://localhost:${PORT}`;
  // Wait until the server answers a TCP connection / HTTP request.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok || response.status === 404) return { child, origin };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Next server did not start on ${origin}`);
}

let server;

test.before(async () => {
  server = await startServer();
});

test.after(async () => {
  if (server?.child) server.child.kill("SIGTERM");
});

test("server-renders the PLANET narrative home", async () => {
  const response = await fetch(`${server.origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PLANET — Pet care reminders your whole family can trust<\/title>/i);
  assert.match(html, /A thousand small acts/);
  assert.match(html, /watches the schedule so you don&#x27;t have to/);
  assert.match(html, /did you already give him/);
  assert.match(html, /The information exists\. It just doesn&#x27;t stay together\./);
  assert.match(html, /What if their whole story/);
  assert.match(html, /Walk in with the story/);
  assert.match(html, /What would PLANET/);
  assert.match(html, /INTERACTIVE PROTOTYPE/);
  assert.match(html, /Try the 30-second care view/);
  assert.match(html, /See a care view/);
  assert.match(html, /Join the first real version/);
  assert.match(html, /No payment during pilot signup/);
  assert.match(html, /Back the first build/);
  assert.match(html, /href="\/checkout\?variant=current"/);
  assert.match(html, /refundable/i);
  assert.match(html, /mydog\.JPG/);
  assert.match(html, /support@joinplanet\.pet/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/refund"/);
  assert.doesNotMatch(html, /Lifetime Membership|Founding 100/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|Building your site/);
});

test("policy pages render and keep the support contact visible", async () => {
  for (const path of ["/terms", "/privacy", "/refund"]) {
    const response = await fetch(`${server.origin}${path}`);
    assert.equal(response.status, 200, `${path} should return 200`);
    const html = await response.text();
    assert.match(html, /support@joinplanet\.pet/, `${path} must show the support email`);
    assert.match(html, /Last updated: August 16, 2026/, `${path} must carry the policy date`);
  }

  const refund = await (await fetch(`${server.origin}/refund`)).text();
  assert.match(refund, /refundable/i);
  const terms = await (await fetch(`${server.origin}/terms`)).text();
  assert.match(terms, /not a medical device/i);
  const privacy = await (await fetch(`${server.origin}/privacy`)).text();
  assert.match(privacy, /Google Analytics 4 with IP/i);
});

test("the page is no longer coupled to the starter preview", async () => {
  const [page, layout, packageJson, globals, caveatFont] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/fonts/caveat-400.ttf", import.meta.url)),
  ]);

  assert.match(page, /CoCreateForm/);
  assert.match(page, /PilotSignup/);
  assert.match(page, /A thousand small acts/);
  assert.doesNotMatch(page, /checkoutUrl|Lifetime Membership/);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview/);
  assert.match(layout, /title: "PLANET — Pet care reminders your whole family can trust"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(globals, /@font-face[\s\S]*caveat-400\.ttf/);
  assert.ok(caveatFont.byteLength > 1000, "self-hosted Caveat font must be present");
});

test("interactive intake paths bound user input and announce recoverable errors", async () => {
  const [quickDemo, pilot, coCreate, intake, schedule, checkout] = await Promise.all([
    readFile(new URL("../app/components/quick-demo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/pilot-signup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/co-create-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/intake-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/tools/schedule/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/checkout-redirect.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(quickDemo, /maxLength=\{254\}/);
  assert.match(quickDemo, /role=\{voteStatus === "error" \? "alert"/);
  assert.match(pilot, /maxLength=\{254\}/);
  assert.match(pilot, /className="pilot-error" role="alert"/);
  assert.match(coCreate, /maxLength=\{1000\}/);
  assert.match(coCreate, /className="cocreate-error" role="alert"/);
  assert.match(intake, /maxLength=\{1000\}/);
  assert.match(intake, /className="modal-footnote" role="alert"/);
  assert.doesNotMatch(schedule, /\$\{(?:view|data)\.petName\}&apos;s/);
  assert.match(checkout, /className="checkout-state" role="status" aria-live="polite"/);
});

test("public invites distinguish unavailable services from expired invites", async () => {
  const invite = await readFile(new URL("../app/invite/[code]/page.tsx", import.meta.url), "utf8");
  assert.match(invite, /response\.status === 404 \|\| response\.status === 410/);
  assert.match(invite, /if \(!response\.ok\) return \{ state: "error" \}/);
  assert.match(invite, /We couldn’t check this invitation\./);
  assert.match(invite, /Try again/);
  assert.match(invite, /This invitation is no longer available\./);
});

test("public summary pages keep the visit reason and PDF print action", async () => {
  const [sharePage, printButton, refreshCss] = await Promise.all([
    readFile(new URL("../app/s/[token]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/s/[token]/print-summary-button.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-refresh.css", import.meta.url), "utf8"),
  ]);
  assert.match(sharePage, /reason\?: string/);
  assert.match(sharePage, /PrintSummaryButton/);
  assert.match(printButton, /window\.print\(\)/);
  assert.match(printButton, /Print \/ save PDF/);
  assert.match(refreshCss, /share-print-button/);
  assert.match(sharePage, /Weight trend/);
  assert.match(sharePage, /Vaccines/);
  assert.match(refreshCss, /share-allergy-card/);
  assert.match(sharePage, /hasField = \(field: keyof SummaryData\)/);
  assert.match(sharePage, /hasProfile = hasField\("allergies"\) \|\| hasField\("conditions"\) \|\| hasField\("notes"\)/);
  assert.match(sharePage, /hasMedications = hasField\("medications"\)/);
  assert.match(sharePage, /hasEvents = hasField\("events"\)/);
});

test("the public checkout service shuts down without dropping in-flight work", async () => {
  const main = await readFile(new URL("../server/lemon-webhook/main.go", import.meta.url), "utf8");
  assert.match(main, /signal\.NotifyContext/);
  assert.match(main, /server\.Shutdown\(shutdownCtx\)/);
  assert.match(main, /WithTimeout\(context\.Background\(\), 10\*time\.Second\)/);
});
