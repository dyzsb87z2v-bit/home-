import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export const creds = () => JSON.parse(readFileSync("tests/e2e/.user.json", "utf8")) as { email: string; password: string };

export async function login(page: Page, locale = "fa") {
  const { email, password } = creds();
  await page.goto(`/${locale}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(fa|de)$/);
}
