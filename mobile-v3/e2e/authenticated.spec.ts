import { expect, test } from "@playwright/test";

const user = {
  id: "user-1",
  email: "care@example.com",
  display_name: "Caregiver",
  locale: "en",
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
  name: "Miso",
  species: "cat",
  breed: "",
  sex: "",
  neutered: false,
  version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

async function mockApi(page: import("@playwright/test").Page) {
  const calls: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    calls.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/me") return json({ user, entitlements: [] });
    if (path === "/me/preferences") return json({ preferences: {} });
    if (path === "/families" && request.method() === "GET")
      return json({ families: [family] });
    if (path === "/pets" && request.method() === "GET")
      return json({ pets: [pet] });
    if (path === "/today")
      return json({
        date: "2026-08-23",
        pets: [
          {
            pet_id: pet.id,
            pet_name: pet.name,
            items: [
              {
                task: {
                  id: "task-1",
                  pet_id: pet.id,
                  title: "Give breakfast",
                  description: "",
                  schedule: {},
                  timezone: family.timezone,
                  time_of_day: "08:00",
                },
                log: null,
              },
            ],
          },
        ],
      });
    if (path === `/pets/${pet.id}`)
      return json({
        pet,
        profile: {
          allergies: [],
          conditions: [],
          emergency_contacts: [],
          notes: "",
        },
      });
    if (path === `/pets/${pet.id}/care-plans` && request.method() === "GET")
      return json({ care_plans: [] });
    if (path === `/pets/${pet.id}/care-plans` && request.method() === "POST")
      return json(
        {
          care_plan: {
            id: "plan-1",
            pet_id: pet.id,
            type: "custom",
            title: "Morning care",
            description: "",
            status: "active",
            frequency: { kind: "daily" },
            schedule: { kind: "daily" },
            start_date: "2026-08-23",
            timezone: family.timezone,
          },
          care_rule: {
            id: "rule-1",
            care_plan_id: "plan-1",
            frequency: { kind: "daily" },
            start_date: "2026-08-23",
            timezone: family.timezone,
          },
        },
        201,
      );
    if (path.startsWith("/care-tasks/") && path.endsWith("/complete"))
      return json({ log: { id: "log-1", status: "done" } }, 201);
    if (path === "/timeline")
      return json({ events: [], next_cursor: undefined });
    return json({});
  });
  await page.addInitScript(() =>
    localStorage.setItem("planet.session", "test-token"),
  );
  return calls;
}

test.describe("authenticated core flows", () => {
  test("E2E-01 creates a care plan from the Pet workspace", async ({
    page,
  }) => {
    const calls = await mockApi(page);
    await page.goto("/pets/pet-1/care/new");
    await page.getByLabel("标题").fill("Morning care");
    await page.getByRole("button", { name: "创建计划" }).click();
    await expect
      .poll(
        () =>
          calls.filter((call) => call === "POST /pets/pet-1/care-plans").length,
      )
      .toBe(1);
  });

  test("E2E-02 completes Today with a server command", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/today");
    await page.getByRole("button", { name: "完成 Give breakfast" }).click();
    await expect
      .poll(() =>
        calls.some((call) => call === "POST /care-tasks/task-1/complete"),
      )
      .toBe(true);
  });

  test("E2E-03 pet timeline route stays writable for that pet", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/pets/pet-1/timeline");
    await expect(
      page.getByRole("button", { name: "记一笔" }),
    ).toBeVisible();
  });
});
