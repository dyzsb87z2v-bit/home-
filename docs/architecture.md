# Architecture

```
 iPhone / MacBook (PWA, fa|de)                    Cloud (no user device needed)
 ┌───────────────────────────┐   HTTPS   ┌──────────────────────────────────────────┐
 │ Next.js App Router pages   │◄────────►│ web: Next.js server (server components,   │
 │ server actions, SW (push)  │          │      server actions, /api routes)         │
 └───────────────────────────┘          │                                            │
                                         │ worker: pg-boss (worker/index.ts)          │
                                         │   tick (1 min) → source-sync per due conn  │
                                         │   email-poll (5 min) → email-sync per acct │
                                         │   process-property → autopilot (A/B/C)     │
                                         │   follow-up-scan (hourly), listing-expiry  │
                                         │   health heartbeat (5 min), dead-letter    │
                                         │                                            │
                                         │ PostgreSQL: app data + pgboss schema       │
                                         └──────────────────────────────────────────┘
                     Gmail API (OAuth) ◄──┘   Anthropic Claude API (optional) ◄──┘
```

## The 12 "agents" are modules, not always-on LLM processes

| Agent | Implementation |
|---|---|
| 1 Source discovery | `data/source-registry.json` (researched), `scripts/seed.ts`, Sources page |
| 2 Monitoring | `features/sources/sync.ts`, `jobs/handlers.ts`, `integrations/providers/*` |
| 3 Extraction | `features/listings/parse-de.ts` (deterministic), `integrations/ai/claude.ts#extractListingFacts` (evidence-checked) |
| 4 Eligibility | `features/matching/eligibility.ts` (deterministic only) |
| 5 Ranking | `features/matching/scoring.ts` |
| 6 Application writer | `features/application-management/letter.ts` (+ optional validated AI sentence) |
| 7 Submission | `features/application-management/service.ts#submitApplication` |
| 8 Email monitoring | `features/email/sync.ts` |
| 9 Translation | `integrations/ai/claude.ts#translate` + deterministic Persian letter templates |
| 10 Follow-up | `features/application-management/followups.ts` |
| 11 Notifications | `features/notifications/service.ts` + `public/sw.js` |
| 12 Security/audit | `lib/logging` (activity + audit), guards in submission, `features/email/classify.ts#screenFraud` |

## Listing pipeline
`adapter → NormalizedListing → ingestListings()`:
1. Find an existing property by (source, listing id) or canonical URL, then by cross-source fingerprint (address + rooms + area), then by a conservative fuzzy match (same PLZ, rooms, area ±1 m², rent ±2 %, same street and house number, or similar text).
2. Merge. The same source overwrites its own facts. Another source only fills unknown fields.
3. Evaluate. Eligibility and score are stored in `property_evaluations` with reasons.
4. Notify about new eligible listings, write activity log entries, enqueue `process-property` for automation.

## Submission safety (in order)
UNCERTAIN previous attempt → status → channel → eligibility re-check with the €1,200 ceiling → duplicate (same property + recipient) → letter validation → recipient syntax and no suspicious reply from that sender → connected account → (AUTO only) authorization scope, min score, daily limit → atomic `DRAFT/FAILED → SENDING` claim → send → store exact content and IDs. Timeouts become `UNCERTAIN` and are never retried automatically.

## Database
Drizzle schema in `lib/database/schema.ts` (28 tables, enums, unique constraints for idempotency). The unique constraint `applications(user_id, property_id, recipient_normalized)` makes duplicate applications impossible at the database level.
