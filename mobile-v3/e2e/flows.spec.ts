import { expect, test } from "@playwright/test";

test.describe("Planet unauthenticated boundary", () => {
  test("01 auth starts with email", async ({ page }) => {
    await page.goto("/auth");
    await expect(
      page.getByRole("heading", { name: "照护，从这里开始" }),
    ).toBeVisible();
    await expect(page.getByLabel("邮箱地址")).toBeVisible();
  });

  test("02 invalid email is rejected locally", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("邮箱地址").fill("not-an-email");
    await page.getByRole("button", { name: "继续" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "请输入有效的邮箱地址。",
    );
  });

  test("03 protected Today redirects to auth", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("04 protected Families redirects to auth", async ({ page }) => {
    await page.goto("/families");
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("05 protected account redirects to auth", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("06 share route remains publicly renderable", async ({ page }) => {
    await page.goto("/share/example-token");
    await expect(page.locator("body")).toContainText(
      /分享不可用|分享已过期|共享的照护信息/,
    );
  });

  test("07 responsive auth remains usable on a narrow viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/auth");
    await expect(
      page.getByRole("button", { name: "继续" }),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow-x", "visible");
  });
});
