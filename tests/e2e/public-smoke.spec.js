import { expect, test } from "@playwright/test";

test.describe("public smoke flows", () => {
  test("browse page loads and primary navigation works", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /browse cubes/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search cubes/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /all locations/i })).toBeVisible();

    await page.getByRole("link", { name: /competitions/i }).click();
    await expect(page).toHaveURL(/\/competitions$/);
    await expect(
      page.getByRole("heading", { name: "Competitions", exact: true })
    ).toBeVisible();

    await page.getByRole("link", { name: /sell/i }).click();
    await expect(page).toHaveURL(/\/sell$/);
    await expect(page.getByRole("heading", { name: /list your cube/i })).toBeVisible();
  });

  test("legacy account pages redirect to dashboard", async ({ page }) => {
    await page.goto("/my-listings");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/my-purchases");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/my-reviews");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("auth modal opens without leaving the page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /account|profile|person/i }).click();

    await expect(page.getByRole("heading", { name: /^log in$/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign up$/i })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
