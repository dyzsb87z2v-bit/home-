# Berlin Rent Hunter AI

Private, bilingual (فارسی / Deutsch) apartment-search platform for one three-person household looking for a long-term rental in **Berlin-Spandau**. It finds listings through permitted channels and checks each one against hard criteria. It also drafts German applications with Claude, sends them only with explicit authorization, and tracks landlord replies and viewing invitations.

> **Status:** see [`PROJECT_STATUS.md`](PROJECT_STATUS.md) and [`SOURCE_COVERAGE.md`](SOURCE_COVERAGE.md). Nothing is deployed yet, and no live source or mailbox is connected yet. Both need your accounts and authorization.

## Hard search criteria (enforced deterministically, never by AI)

| Criterion | Rule |
|---|---|
| Location | Bezirk Spandau (official boundary, postal codes, Ortsteile) |
| Warmmiete | ≤ **€1,200**. Missing Warmmiete → `NEEDS_VERIFICATION` (Kaltmiete is never treated as Warmmiete). Auto-apply is capped at €1,200 even if the editable filter is raised. |
| Rooms / area | ≥ 3 rooms, ≥ 50 m² |
| Type | Entire apartment only. No WG rooms, holiday flats, dorms or hotels. |
| WBS | Listings that require a WBS are excluded |
| Tenancy | Long-term only. Temporary or "auf Zeit" listings are excluded. |

Classification: `ELIGIBLE` / `INELIGIBLE` / `NEEDS_VERIFICATION`, each with reasons. Applications are only ever sent for `ELIGIBLE` listings.

## How listings get in (legally and honestly)

1. **Portal alert emails** (optional, currently not used). If you create saved searches on ImmoScout24, Gewobag, degewo, inBerlinWohnen and other portals, using your Gmail address, the worker reads them through Gmail OAuth (read-only) and parses the listing links and facts.
2. **Official feeds.** If a provider publishes an RSS, Atom or JSON feed, paste its URL on the Sources page. The fetcher identifies itself, honours `robots.txt`, rate-limits each host and backs off.
3. **Manual import.** Paste a listing URL and its text. Optionally Claude extracts the facts, and a fact is kept only if Claude quotes evidence for it from the text.

No CAPTCHA bypassing, no proxy rotation, no stealth scraping, no logins to portals.

## Quick start (local)

```bash
cp .env.example .env.local    # fill SESSION_SECRET, APP_ENCRYPTION_KEY, DATABASE_URL
npm install
npm run db:migrate && npm run db:seed
BRH_EMAIL=you@example.com BRH_PASSWORD='a-long-password' BRH_NAME='Milad Masoudi' npm run user:create
npm run dev          # web app → http://localhost:3000
npm run worker       # background monitoring (separate process)
```

Optional integrations, all configured through environment variables (see `.env.example`):

- `ANTHROPIC_API_KEY`: Claude translation, extraction, reply classification and personalization. A monthly budget cap applies.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Gmail OAuth for sending and replies.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: web push. On iPhone this works after "Add to Home Screen".

## Tests

```bash
npm test                    # unit (eligibility, Spandau geography, parsing, scoring, dedupe, letters, classifier, i18n parity…)
npm run test:integration    # real PostgreSQL: ingestion, dedupe, submission guards, auto-apply limits, replies, alerts, follow-ups
ENABLE_DEV_TOOLS=1 npm run build && ENABLE_DEV_TOOLS=1 npm start &   # then:
npm run test:e2e            # Playwright: full workflow on desktop + iPhone viewport (simulated mailbox, no real emails)
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md): components, agents, data flow
- [`docs/automation.md`](docs/automation.md): modes A/B/C, authorization, safeguards
- [`docs/source-registry.md`](docs/source-registry.md): how sources are registered and connected
- [`docs/deployment.md`](docs/deployment.md): hosting, cost estimate, checklist
- [`docs/privacy.md`](docs/privacy.md): data protection, documents, AI safety

---

**فارسی:** این برنامه یک سامانهٔ خصوصی و دوزبانه برای پیدا کردن آپارتمان بلندمدت در برلین-اشپانداو است. حداکثر اجارهٔ گرم ۱۲۰۰ یورو، حداقل ۳ اتاق و ۵۰ متر مربع، بدون WBS. ارسال خودکار درخواست به‌طور پیش‌فرض خاموش است و فقط با اجازهٔ صریح شما روشن می‌شود.
