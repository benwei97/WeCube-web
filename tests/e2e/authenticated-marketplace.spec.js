import { expect, test } from "@playwright/test";
import { attachSampleImage, getTestAccount, login } from "./helpers";

const seller = getTestAccount("SELLER");
const buyer = getTestAccount("BUYER");

test.describe("authenticated marketplace flows", () => {
  test.skip(!seller || !buyer, "Set E2E_SELLER_EMAIL/PASSWORD and E2E_BUYER_EMAIL/PASSWORD to run.");

  test("seller can start listing flow and required-field validation appears", async ({ page }) => {
    await page.goto("/");
    await login(page, seller);

    await page.getByRole("link", { name: /sell/i }).click();
    await expect(page.getByRole("heading", { name: /list your cube/i })).toBeVisible();

    await page.getByRole("button", { name: /publish listing/i }).click();
    await expect(page.getByText(/fill in all required fields|select at least one fulfillment/i)).toBeVisible();
  });

  test("seller can create a shippable listing", async ({ page }) => {
    const title = `QA Test Cube ${Date.now()}`;

    await page.goto("/");
    await login(page, seller);
    await page.goto("/sell");

    await attachSampleImage(page);
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Price (USD)").fill("12");
    await page.getByLabel("Puzzle Type").click();
    await page.getByRole("option").first().click();
    await page.getByLabel("Condition").click();
    await page.getByRole("option").first().click();
    await page.getByLabel("Description").fill("Automated QA listing. Safe to delete.");
    await page.getByText("Shipping", { exact: true }).click();
    await page.getByRole("button", { name: /yes/i }).click();
    await page.getByRole("button", { name: /publish listing/i }).click();

    await expect(page).toHaveURL(/\/listing\//, { timeout: 30_000 });
    await expect(page.getByText(/your listing has been posted/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });
});
