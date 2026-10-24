/** Regenerates SOURCE_COVERAGE.md from data/source-registry.json. Usage: npx tsx scripts/source-coverage.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { ALERT_PATTERNS } from "@/integrations/providers/email-alerts";

type Entry = { slug: string; name: string; url: string; category: string; existsVerified: boolean | null; operatingStatus: string; spandauRelevance: string; integrationOptions: string[]; notes: string };
const reg = JSON.parse(readFileSync("data/source-registry.json", "utf8")) as Entry[];
const alertSlugs = new Set(ALERT_PATTERNS.map((p) => p.slug));

function capability(e: Entry) {
  if (e.operatingStatus === "DEFUNCT" || e.operatingStatus === "MERGED" || e.existsVerified === false) return "UNAVAILABLE";
  if (e.integrationOptions.includes("EMAIL_ALERTS") && alertSlugs.has(e.slug)) return "ALERTS_ONLY (parser implemented, needs user's alert + Gmail)";
  return "MANUAL_ONLY (manual import; optional official feed URL)";
}

const rows = reg.map((e) => `| ${e.name} | ${e.category} | ${e.operatingStatus}${e.existsVerified === null ? " (unverified)" : ""} | ${e.spandauRelevance} | ${e.integrationOptions.join(", ") || "—"} | ${capability(e)} | NOT CONNECTED | ${e.notes.replace(/\|/g, "/").replace(/\n/g, " ")} |`);
const md = `# Source coverage

Generated from \`data/source-registry.json\` (research date 2026-10-24) by \`scripts/source-coverage.ts\`.

**Live connection status as of this report: no source is live-connected.** The build sandbox could not reach any rental website (egress proxy 403), and no Gmail account has been authorized yet. "Live status" changes only when real data arrives — see the Sources page in the app for the current per-user state.

Legend — *Capability*: what this codebase can do for the source. *Live status*: whether real data has been received.

| Source | Category | Operating status | Spandau relevance | Public integration options found | Capability in this app | Live status | Research notes |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

Totals: ${reg.length} registered · ${reg.filter((e) => capability(e).startsWith("ALERTS")).length} with alert-email parsers · ${reg.filter((e) => capability(e) === "UNAVAILABLE").length} unavailable · 0 live-connected.
`;
writeFileSync("SOURCE_COVERAGE.md", md);
console.log("SOURCE_COVERAGE.md written");
