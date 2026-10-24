import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("complete apartment → application → reply workflow (simulated providers)", async ({ page }) => {
  // 1–2. Login and dashboard (Persian, RTL)
  await login(page, "fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "نمای کلی" })).toBeVisible();

  // 3. Switch Persian → German (LTR)
  await page.getByRole("button", { name: "Deutsch" }).first().click();
  await page.waitForURL(/\/de$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();

  // Attach synthetic test provider + simulated mailbox (dev tools only)
  expect((await page.request.post("/api/dev/setup", { data: { action: "test-provider" } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/dev/setup", { data: { action: "test-email" } })).ok()).toBeTruthy();

  // 4. View apartment listings
  await page.goto("/de/feed");
  await expect(page.getByText("[TEST] 3 Zimmer, zu teuer")).toBeVisible();
  await page.goto("/de/apartments");
  const card = page.getByRole("link", { name: /\[TEST\] 3-Zimmer-Wohnung mit Balkon/ });
  await expect(card).toBeVisible();

  // 5–6. Property details and eligibility
  await card.click();
  await expect(page.getByText("Passend").first()).toBeVisible();
  await expect(page.getByText(/Warmmiete 1\.090 € \(max\. 1\.200 €\)/)).toBeVisible();
  await expect(page.getByText("Keine Fotos verfügbar")).toBeVisible();

  // 7. Generate German application
  await page.getByRole("button", { name: "Bewerbung entwerfen" }).click();
  await page.reload();
  const body = page.locator("textarea[name=bodyDe]");
  await expect(body).toHaveValue(/Sehr geehrte Damen und Herren/);
  await expect(body).toHaveValue(/3\.500 Euro/);
  await expect(body).toHaveValue(/Milad Masoudi/);
  await expect(page.getByText("Text geprüft: keine unbelegten Angaben")).toBeVisible();

  // Persian translation of the application for review
  await page.getByText("Persische Übersetzung (nur zur Kontrolle)").click();
  await expect(page.getByText(/خانم‌ها و آقایان محترم/)).toBeVisible();

  // 8. Save draft
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert")).toBeVisible();
  const applicationId = await page.locator("input[name=applicationId]").first().inputValue();

  // Sending requires the explicit confirmation checkbox
  await page.getByRole("button", { name: "Jetzt senden" }).click();
  await expect(page.locator("input[name=confirm]:invalid")).toHaveCount(1);

  // 9. Authorized submission through the simulated provider
  await page.getByLabel(/Ich habe den Text geprüft/).check();
  await page.getByRole("button", { name: "Jetzt senden" }).click();
  await expect(page.getByText(/^Gesendet am:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Jetzt senden" })).toHaveCount(0); // cannot be sent twice

  // 10. Application history
  await page.goto("/de/applications");
  await expect(page.getByText("Gesendet").first()).toBeVisible();

  // 11. Simulated landlord reply → viewing invitation
  const r = await page.request.post("/api/dev/inbound", {
    data: { applicationId, subject: "Re: Wohnungsanfrage", text: "Guten Tag Herr Masoudi, gerne laden wir Sie zur Besichtigung am 12.11.2026 um 17:30 Uhr ein. Mit freundlichen Grüßen" },
  });
  expect(r.ok()).toBeTruthy();
  await page.goto("/de/replies");
  await expect(page.getByText("Einladung zur Besichtigung").first()).toBeVisible();
  await page.goto("/de/viewings");
  await expect(page.getByText(/12\.11\.2026/)).toBeVisible();

  // 12. Persian views of the reply and notifications
  await page.goto("/fa/replies");
  await expect(page.getByText("دعوت به بازدید").first()).toBeVisible();
  await page.goto("/fa/notifications");
  await expect(page.getByText(/دعوت به بازدید/).first()).toBeVisible();

  // Activity log has real events
  await page.goto("/de/activity");
  await expect(page.getByText("Bewerbung gesendet").first()).toBeVisible();
  await expect(page.getByText("Besichtigungseinladung erkannt").first()).toBeVisible();
});

test("ineligible and unverified listings cannot be applied to automatically", async ({ page }) => {
  await login(page, "de");
  await page.goto("/de/feed?e=INELIGIBLE");
  await page.getByRole("link", { name: /\[TEST\] 3 Zimmer, zu teuer/ }).click();
  await expect(page.getByText(/Abgelehnt: Warmmiete 1\.350 € liegt über 1\.200 €/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Bewerbung entwerfen" })).toHaveCount(0);

  await page.goto("/de/feed?e=NEEDS_VERIFICATION");
  await page.getByRole("link", { name: /\[TEST\] Warmmiete fehlt/ }).click();
  await expect(page.getByText("Warmmiete nicht veröffentlicht — Prüfung nötig")).toBeVisible();
  // user confirms facts from the original listing → re-evaluated
  await page.locator("#warmRentEur").fill("1150");
  await page.getByRole("button", { name: "Angaben übernehmen und neu prüfen" }).click();
  // the page re-renders with the new evaluation (now eligible → verification form disappears)
  await expect(page.getByText(/Warmmiete 1\.150 € \(max\. 1\.200 €\)/)).toBeVisible();
  await expect(page.getByText("Passend").first()).toBeVisible();
});

test("sources page shows honest statuses", async ({ page }) => {
  await login(page, "de");
  await page.goto("/de/sources?state=UNAVAILABLE");
  await expect(page.getByText("Homelike", { exact: true })).toBeVisible();
  await expect(page.getByText("Immonet", { exact: true })).toBeVisible();
  await page.goto("/de/sources?state=CONNECTED");
  await expect(page.getByText("ImmoScout24", { exact: true })).toHaveCount(0);
});

test("automation: AUTO-APPLY is OFF by default and needs explicit authorization", async ({ page }) => {
  await login(page, "de");
  await page.goto("/de/automation");
  await expect(page.getByText("AUS").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Freigeben und Auto-Bewerbung einschalten" })).toBeVisible();
  await page.getByRole("button", { name: "Freigeben und Auto-Bewerbung einschalten" }).click();
  await expect(page.locator("input[name=confirm]:invalid")).toHaveCount(1);
});
