import { expect } from "@playwright/test";

export function getTestAccount(prefix) {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];

  return email && password ? { email, password } : null;
}

export async function login(page, account) {
  await page.getByRole("button", { name: /account|profile|person/i }).click();
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page.getByRole("button", { name: /^log in$/i })).toBeHidden();
}

export async function attachSampleImage(page) {
  const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({
    name: "sample-cube.png",
    mimeType: "image/png",
    buffer: Buffer.from(png1x1Base64, "base64"),
  });
}

export async function dismissIfVisible(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
  }
}
