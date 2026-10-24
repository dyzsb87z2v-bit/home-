# Project status

Last updated: 2026-10-24. States: COMPLETED (implemented) · TESTED (implemented and verified by automated tests or a browser run) · IN_PROGRESS · BLOCKED · NOT_STARTED.

## Milestones

| # | Milestone | State | Notes |
|---|---|---|---|
| 1 | Project foundation | TESTED | Next.js 16, TypeScript, Drizzle and PostgreSQL schema with 28 tables and migrations, lint and typecheck clean. Built in the session repo `dyzsb87z2v-bit/home-` on branch `claude/berlin-rent-hunter-ai`. No separate `berlin-rent-hunter-ai` repo was created (see Blockers). |
| 2 | Bilingual dashboard | TESTED | fa (RTL) and de (LTR), all 17 sections, PWA. Playwright covers language switching, desktop and an iPhone 14 viewport. |
| 3 | Source infrastructure | TESTED | Registry of 51 researched sources plus manual import, an adapter interface, feed / email-alert / manual / test adapters, robots.txt handling, rate limits, honest status computation. |
| 4 | Database & matching | TESTED | Eligibility engine, scoring, cross-source dedupe with idempotent upserts. |
| 5 | Live data connections | BLOCKED | No live source verified. The sandbox egress proxy blocked every rental site (403). Gmail is not authorized yet. The email-alert path is built and tested with fixture emails. |
| 6 | Application automation | TESTED | Template plus validated optional AI sentence, drafts, guarded submission, audit, UNCERTAIN handling. Tested against a simulated mailbox only. |
| 7 | Reply management | TESTED | Rules plus optional AI classification, scam screening, viewing extraction, follow-ups. Tested against the simulated mailbox. |
| 8 | Cloud monitoring | IN_PROGRESS | pg-boss worker with schedules, retries, dead letters and heartbeat runs locally. Not deployed: needs a hosting account and approval to pay. |
| 9 | Security & testing | TESTED | 66 unit, 18 integration and 6 e2e tests pass. |
| 10 | Deployment & verification | NOT_STARTED | Dockerfile, Render blueprint and CI workflow are written but none has run. Needs authorization. |

## Features

| Feature | State | Evidence |
|---|---|---|
| Hard filter: Warmmiete ≤ €1,200 (auto-apply ceiling cannot be raised) | TESTED | `tests/unit/eligibility.test.ts`, integration "NOT_ELIGIBLE" |
| Spandau geography (official boundary polygon, PLZ, Ortsteile, shared PLZ 13629) | TESTED | unit tests with real coordinates |
| ≥3 rooms, ≥50 m², entire apartment, no WBS, long-term | TESTED | unit tests |
| Unknown facts → NEEDS_VERIFICATION; user fact confirmation → re-evaluation | TESTED | unit + e2e |
| Priority scoring (affordability tiers ≤900 / ≤1,050 / ≤1,150 / ≤1,200) | TESTED | unit |
| Cross-source duplicate detection | TESTED | unit + integration (house-number bug found and fixed) |
| German application generator (template, verified facts only, validator) | TESTED | unit + integration + e2e |
| Persian translation of applications (deterministic template) | TESTED | e2e |
| Claude AI (extraction with evidence check, translation, classification, personalization, cost cap) | COMPLETED | Code paths are unit-tested with mocked outputs (evidence filter). Never called live: no API key in this environment. |
| Submission engine (eligibility re-check, duplicate guard, validation, recipient check, atomic claim, UNCERTAIN never auto-retried) | TESTED | integration |
| AUTO-APPLY: off by default, explicit scoped authorization, daily limit, min score, pause, revoke | TESTED | integration + e2e |
| Gmail OAuth (connect, encrypted refresh token, send, read) | COMPLETED | MIME and parsing unit-tested. No live OAuth run: no Google client credentials. |
| Email alert ingestion (ImmoScout24, degewo, Gewobag, inBerlinWohnen, … patterns) | TESTED | Integration test with a synthetic alert email. Real alert layouts not yet seen. |
| RSS/Atom/JSON feed adapter with robots.txt | TESTED | Unit tests on the parsers. No live feed fetched. |
| Landlord reply classification and scam detection | TESTED | unit + integration |
| Viewing invitation detection (Berlin time, DST) | TESTED | unit + integration + e2e |
| Follow-ups (config, never after rejection or stop request, max count) | TESTED | integration |
| Notifications (in-app, dedupe, per-category prefs) | TESTED | integration + e2e |
| Web push (VAPID, service worker) | COMPLETED | No VAPID keys or real device test. iOS needs the PWA installed. |
| Email notifications to the user | NOT_STARTED | Only in-app and push exist. |
| Document vault (AES-256-GCM, magic-byte check, audit, retention date, delete) | COMPLETED | Manually verifiable in the UI. No automated test yet. Retention auto-deletion job: NOT_STARTED. |
| Map (MapLibre, Spandau boundary, clustering) | COMPLETED | Page renders. Tiles were blocked in the sandbox, so tile display is unverified. |
| Activity log / audit log | TESTED | e2e checks activity entries |
| Data export and account deletion | COMPLETED | Not covered by automated tests. |
| Background worker (pg-boss: schedules, retries, backoff, dead-letter, heartbeat) | TESTED | Ran locally and the heartbeat showed on /api/health. Cloud run not verified. |
| Safari / WebKit | NOT_STARTED | Only Chromium is available here. The "iPhone" e2e test uses the iPhone 14 viewport in Chromium, not real Safari. |

## Blockers (need the user)

1. **GitHub:** this session can only access `dyzsb87z2v-bit/home-`, so the code lives there on branch `claude/berlin-rent-hunter-ai`. Creating a new private `berlin-rent-hunter-ai` repository needs your go-ahead, or you can create it and move the code.
2. **Hosting:** pick a provider and approve the cost (estimate in `docs/deployment.md`).
3. **Gmail:** create a Google OAuth client (Web), set the two env vars, then click "Connect Gmail" in Settings.
4. **Anthropic API key** (optional): needed for Persian translation of free text, AI extraction and AI reply classification.
5. **Portal saved searches:** create them on each portal with your Gmail address. This is the only legitimate automated listing channel found for most sources.

## Known problems / limitations

- Real alert-email layouts have not been seen, so the parser works on URL patterns plus surrounding text and may need tuning on the first real emails.
- Most sources offer no public API or feed. Portals usually require their own contact form, so those applications are drafted for manual submission.
- When the Warmmiete is missing from an alert snippet, the listing stays `NEEDS_VERIFICATION` until you confirm the facts. This is by design.
- The ImmoScout24 official API is aimed at partners and realtors and is not integrated.
