import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";

// Spin up `next start` on an ephemeral port and fetch the rendered HTML.
// `npm run build` must run before this test (see the CI flow).
const PORT = String(4321 + (process.pid % 1000));

async function startServer() {
  const child = spawn("npx", ["next", "start", "-p", PORT], {
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

test("server-renders the PLANET validation landing page", async () => {
  const response = await fetch(`${server.origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PLANET — Their whole world\. One place\.<\/title>/i);
  assert.match(html, /I didn't plan to build an app/);
  assert.match(html, /professional pet intelligence|professional pet model/);
  assert.match(html, /A clear path forward/);
  assert.match(html, /Care is a shared verb/);
  assert.match(html, /mydog\.JPG/);
  assert.match(html, /Lifetime membership/i);
  assert.match(html, /S\$29\.99/);
  assert.match(html, /S\$69\.99/);
  assert.match(html, /S\$129\.99/);
  // checkout link points at the Go backend via apiUrl("/checkout?variant=...").
  // With NEXT_PUBLIC_API_BASE unset, it renders as /checkout?variant=current
  assert.match(html, /href="\/checkout\?variant=current"/);
  // Three founding tiers shown inside the segmented progress meter.
  assert.match(html, /meter-tier-price.*S\$29\.99/s);
  assert.match(html, /meter-tier-price.*S\$69\.99/s);
  assert.match(html, /meter-tier-price.*S\$129\.99/s);
  assert.equal((html.match(/<h3>Lifetime Membership<\/h3>/g) ?? []).length, 1);
  assert.equal((html.match(/href="\/checkout\?variant=current"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|Building your site/);
});

test("the page is no longer coupled to the starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Founding 100/);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview/);
  assert.match(layout, /title: "PLANET — Their whole world\. One place\."/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
