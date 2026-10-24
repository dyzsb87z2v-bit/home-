import { emailAlertsAdapter } from "./email-alerts";
import { feedAdapter } from "./feed";
import { testAdapter } from "./test-provider";
import type { AdapterId, SourceAdapter } from "./types";

const manualAdapter: SourceAdapter = { id: "manual", kind: "event", validateConfig() {} };

export const ADAPTERS: Record<AdapterId, SourceAdapter> = {
  feed: feedAdapter,
  "email-alerts": emailAlertsAdapter,
  manual: manualAdapter,
  test: testAdapter,
};

export function getAdapter(id: string): SourceAdapter | null {
  return (ADAPTERS as Record<string, SourceAdapter>)[id] ?? null;
}
