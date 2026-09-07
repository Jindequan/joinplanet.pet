import { expect, test } from "@playwright/test";

// 契约冒烟：把后端三轮加固后的关键行为锁进前端回归。
// 全 mock（不依赖真实后端），断言的是前端对这些契约的呈现。

const user = {
  id: "user-1",
  email: "care@example.com",
  display_name: "Caregiver",
  locale: "zh-CN",
  created_at: "2026-01-01T00:00:00Z",
};
const family = {
  id: "family-1",
  name: "Home",
  timezone: "Asia/Shanghai",
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
};
const pet = {
  id: "pet-1",
  family_ids: ["family-1"],
  primary_family_id: "family-1",
  current_owner_user_id: "user-1",
  name: "Miso",
  species: "cat",
  breed: "",
  sex: "",
  neutered: false,
  version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function json(route: import("@playwright/test").Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function baseMocks(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/me") return json(route, { user, entitlements: [] });
    if (path === "/me/preferences") return json(route, { preferences: {} });
    if (path === "/families" && request.method() === "GET")
      return json(route, { families: [family] });
    if (path === "/pets" && request.method() === "GET")
      return json(route, { pets: [pet] });
    if (path === "/care-stats")
      return json(route, {
        from: "2026-08-01",
        to: "2026-08-31",
        total: 0,
        completed: 0,
        skipped: 0,
        missed: 0,
        rate: null,
        per_pet: [],
        per_day: [],
      });
    if (path === "/timeline") return json(route, { events: [] });
    return json(route, { error: { code: "RESOURCE_NOT_FOUND", message: "not found" } }, 404);
  });
}

async function signIn(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("planet.session", "e2e-token");
    window.localStorage.setItem("planet_lang", "zh-CN");
  });
}

test("trends renders the `rate` contract key, including the null state", async ({ page }) => {
  await baseMocks(page);
  await signIn(page);
  await page.goto("/trends");
  await expect(page.getByRole("heading", { name: "全部宠物" })).toBeVisible();
  // rate === null（纪念/空集）必须渲染为 "—"，而不是 undefined%
  await expect(page.getByText("—").first()).toBeVisible();
  await expect(page.getByText("undefined")).toHaveCount(0);
});

test("Today view beyond 30 days surfaces the localized window message", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/me") return json(route, { user, entitlements: [] });
    if (path === "/me/preferences") return json(route, { preferences: {} });
    if (path === "/families" && request.method() === "GET")
      return json(route, { families: [family] });
    if (path === "/pets" && request.method() === "GET")
      return json(route, { pets: [pet] });
    if (path === "/today")
      return json(
        route,
        { error: { code: "VALIDATION_FAILED", message: "history limited to the past 30 days" } },
        400,
      );
    return json(route, { error: { code: "RESOURCE_NOT_FOUND", message: "not found" } }, 404);
  });
  await signIn(page);
  await page.goto("/today");
  // 后端 30 天窗口报错必须以中文呈现，而不是裸英文
  await expect(page.getByText("只能回看最近 30 天").first()).toBeVisible();
});

test("family with pets shows the relocation guidance instead of a raw 409", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/me") return json(route, { user, entitlements: [] });
    if (path === "/me/preferences") return json(route, { preferences: {} });
    if (path === "/families" && request.method() === "GET")
      return json(route, { families: [family] });
    if (path === "/families/family-1") return json(route, { family, members: [] });
    if (path === "/families/family-1/pets") return json(route, { pets: [pet] });
    if (path === "/families/family-1/handoff-summary")
      return json(route, { pets: [] });
    if (path === "/pets" && request.method() === "GET")
      return json(route, { pets: [pet] });
    return json(route, { error: { code: "RESOURCE_NOT_FOUND", message: "not found" } }, 404);
  });
  await signIn(page);
  await page.goto("/families/family-1");
  await page.getByRole("button", { name: /删除家庭/ }).click();
  // 有宠物时不弹删除确认，而是「先安置宠物」引导（中文、含转移按钮）
  await expect(page.getByRole("heading", { name: /里还有 1 只宠物/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "转移" }).first()).toBeVisible();
});
