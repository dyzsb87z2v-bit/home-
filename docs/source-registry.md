# Source registry

`data/source-registry.json` holds 51 sources researched on 2026-10-24 via web search (direct site access was blocked from the build environment). Each entry records: existence, operating status (ACTIVE / MERGED / DEFUNCT / UNKNOWN), Spandau relevance, public integration options found (official or partner API, RSS, email alerts, website only) and evidence notes. `scripts/seed.ts` loads it into `rental_sources`. `scripts/source-coverage.ts` regenerates `SOURCE_COVERAGE.md`.

Notable findings: Immonet merged into Immowelt (2026). Homelike is defunct (insolvency 2025). No evidence was found that "WohnAlert" exists. Gewobag is the largest landlord in Spandau. GESOBAU and STADT UND LAND report no Spandau stock. The ImmoScout24 REST API is for partners and realtors.

## Status model
- `rental_sources.operational_state` = what this app can do for the source: ALERTS_ONLY (an alert parser exists), MANUAL_ONLY, or UNAVAILABLE.
- `source_connections` = the per-user integration: adapter (`email-alerts`, `feed`, `manual`, `test`), enabled, last success, failures, interval.
- The UI status (`features/sources/status.ts`) is **earned**. It shows CONNECTED only after a recent successful feed sync and ALERTS_ONLY only after a real alert email was processed (within 14 days). Otherwise it shows MANUAL_ONLY "awaiting alerts", PARTIALLY_CONNECTED on errors, or DISABLED.

## Adding a source
1. Add an entry to `data/source-registry.json` (evidence in `notes`) and run `npm run db:seed`.
2. If it sends alert emails, add a pattern to `ALERT_PATTERNS` in `integrations/providers/email-alerts.ts` (sender domains + listing-URL regex) and a test.
3. If it publishes an official feed, connect the feed URL on the Sources page. Nothing else is needed.
4. Never add adapters that bypass access restrictions.
