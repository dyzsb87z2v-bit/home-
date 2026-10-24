import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("iPhone layout: bottom navigation, RTL, no horizontal overflow", async ({ page }) => {
  await login(page, "fa");
  await page.goto("/fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const nav = page.locator("nav.fixed");
  await expect(nav).toBeVisible();
  for (const path of ["/fa", "/fa/feed", "/fa/sources", "/fa/automation", "/de/settings", "/de/profile"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  // drawer menu reaches all sections
  await page.goto("/de");
  await page.getByRole("button", { name: "Mehr" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Unterlagen" }).click();
  await expect(page.getByRole("heading", { name: "Unterlagen" })).toBeVisible();
});

test("PWA manifest and service worker are served", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBeTruthy();
  expect((await m.json()).display).toBe("standalone");
  expect((await request.get("/sw.js")).ok()).toBeTruthy();
  expect((await request.get("/icons/icon-192.png")).ok()).toBeTruthy();
});
