import { describe, expect, it } from "vitest";
import { renderNotificationText } from "@/features/notifications/email";
import { berlinToday } from "@/features/documents/retention";

describe("notification email text", () => {
  it("renders the localized template with payload values", () => {
    expect(renderNotificationText("de", "HIGH_PRIORITY", { title: "Helle Wohnung", warm: 990 })).toBe("Sehr gute neue Wohnung: Helle Wohnung (990 € warm)");
    expect(renderNotificationText("de", "LANDLORD_REPLY", {})).toBe("Neue Antwort: –");
    expect(renderNotificationText("fa", "NEW_ELIGIBLE", { title: "X" })).toContain("X");
  });
});

describe("retention date", () => {
  it("uses the Berlin calendar day", () => {
    expect(berlinToday(new Date("2026-10-23T23:00:00Z"))).toBe("2026-10-24");
    expect(berlinToday(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });
});
