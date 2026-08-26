import { expect, test } from "@playwright/test";

test("mobile console uses an icon bottom bar and organized more sheet", async ({ page }) => {
  await page.goto("/signup"); await page.getByLabel("Email").fill("mobile-e2e@example.com"); await page.getByLabel("Password").fill("production-test-password-789"); await page.getByRole("button", { name: "Create account" }).click();
  const nav = page.locator('nav[aria-label="Console"]:visible');
  await expect(nav.getByText("Home", { exact: true })).toBeVisible();
  await expect(nav.getByText("Purchase", { exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet.getByText("Reports", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Evidence", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Settings", { exact: true })).toBeVisible();
});
