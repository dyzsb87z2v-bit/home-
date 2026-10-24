export type DisplayState = "CONNECTED" | "ALERTS_ONLY" | "PARTIALLY_CONNECTED" | "MANUAL_ONLY" | "UNAVAILABLE" | "DISABLED";

type Conn = { adapter: string; enabled: boolean; state: string; lastSuccessAt: Date | null; consecutiveFailures: number; intervalMinutes: number };

/**
 * Honest status: a source is only CONNECTED/ALERTS_ONLY when data actually arrived recently.
 * Registered-but-unproven integrations show as MANUAL_ONLY (with an "awaiting" hint in the UI).
 */
export function displayState(sourceState: string, conns: Conn[], now = new Date()): { state: DisplayState; awaiting: boolean } {
  if (sourceState === "UNAVAILABLE") return { state: "UNAVAILABLE", awaiting: false };
  if (sourceState === "DISABLED") return { state: "DISABLED", awaiting: false };
  const enabled = conns.filter((c) => c.enabled);
  if (!enabled.length) return { state: conns.length ? "DISABLED" : "MANUAL_ONLY", awaiting: false };

  const feed = enabled.filter((c) => c.adapter === "feed" || c.adapter === "test");
  const fresh = (c: Conn, maxAgeMin: number) => !!c.lastSuccessAt && now.getTime() - c.lastSuccessAt.getTime() < maxAgeMin * 60_000;
  if (feed.some((c) => c.consecutiveFailures === 0 && fresh(c, c.intervalMinutes * 3 + 60))) return { state: "CONNECTED", awaiting: false };
  if (feed.some((c) => c.consecutiveFailures > 0)) return { state: "PARTIALLY_CONNECTED", awaiting: false };

  const alerts = enabled.filter((c) => c.adapter === "email-alerts");
  // Alert emails depend on the portal's own schedule; accept up to 14 days without one.
  if (alerts.some((c) => fresh(c, 14 * 24 * 60))) return { state: "ALERTS_ONLY", awaiting: false };
  if (alerts.length) return { state: "MANUAL_ONLY", awaiting: true };
  return { state: "MANUAL_ONLY", awaiting: false };
}
