import { expect, test } from "@playwright/test";

test("protected redirects, signup, logout, and login form navigation work", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fsettings/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Fapp%2Fsettings/);
  await page.getByLabel("Email").fill("auth-e2e@example.com");
  await page.getByLabel("Password").fill("production-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("organization invitation shares the workspace and role is enforced", async ({ browser }) => {
  const owner = await browser.newContext(); const page = await owner.newPage();
  await page.goto("/signup"); await page.getByLabel("Email").fill("org-owner-e2e@example.com"); await page.getByLabel("Password").fill("production-test-password-123"); await page.getByRole("button", { name: "Create account" }).click(); await expect(page).toHaveURL(/\/app\/settings/); await page.goto("/app/settings#organization");
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByLabel("Role")).toHaveAttribute("data-slot", "select-trigger");
  await page.getByLabel("Email").last().fill("viewer-e2e@example.com");
  await page.getByLabel("Role").click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await page.getByRole("button", { name: "Create invitation" }).click();
  const invitation = await page.locator("text=/\/invite\//").innerText();

  const viewer = await browser.newContext(); const invited = await viewer.newPage();
  await invited.goto("/signup"); await invited.getByLabel("Email").fill("viewer-e2e@example.com"); await invited.getByLabel("Password").fill("production-test-password-456"); await invited.getByRole("button", { name: "Create account" }).click(); await expect(invited).toHaveURL(/\/app\/settings/);
  await invited.goto(invitation); await invited.getByRole("button", { name: "Join organization" }).click();
  await expect(invited).toHaveURL(/\/app/); await invited.goto("/app/settings");
  await expect(invited.getByText("viewer", { exact: true }).first()).toBeVisible();
  await expect(invited.getByText("Not available for this role.").first()).toBeVisible();
  const response = await invited.request.post("/api/v1/ingest", { data: { records: [] } });
  expect(response.status()).toBe(403);
  await owner.close(); await viewer.close();
});
