# Deployment

Two processes share one PostgreSQL database:
- **web**: `npm run start` (Docker CMD runs migrations and seed first)
- **worker**: `npm run worker` (must run continuously; this is what keeps monitoring going while your devices are off)

## Recommended: Render (Frankfurt), `render.yaml` blueprint
Creates `brh-db` (PostgreSQL 16), `brh-web` (Docker web service, health check `/api/health`) and `brh-worker` (Docker background worker).

### Cost estimate (verify current prices before approving; nothing has been purchased)
| Item | Plan | Approx. monthly |
|---|---|---|
| Web service | Render Starter | ~$7 |
| Background worker | Render Starter | ~$7 |
| PostgreSQL | Render Basic-256MB | ~$6 |
| Anthropic API | usage, hard cap via `AI_MONTHLY_BUDGET_CENTS` (default $20) | typically $1–10 for one household |
| Gmail API, web push, OpenStreetMap tiles | free (fair use) | $0 |
| **Total** | | **~$20–30 / month** |

Alternatives: Railway or Fly.io (usage-based, similar total), or a single small VPS running Docker Compose (~€5–10) with your own backups.

## Environments
`APP_ENV=development | testing | production`. In production, test providers, the simulated mailbox, dev API routes (`/api/dev/*`) and sample listings are disabled or hidden.

## Checklist
- [ ] Create the hosting account and approve the cost
- [ ] Set secrets: `SESSION_SECRET` (≥32 chars), `APP_ENCRYPTION_KEY` (32-byte base64, back it up: losing it makes stored tokens and documents unreadable), `APP_URL`
- [ ] Google Cloud: OAuth client (Web), redirect URI `${APP_URL}/api/email/google/callback`, Gmail API enabled, scopes `gmail.send` + `gmail.readonly`, consent screen in "Testing" with your address as a test user
- [ ] Optional: `ANTHROPIC_API_KEY`, `AI_MONTHLY_BUDGET_CENTS`
- [ ] Optional: VAPID keys (`npx web-push generate-vapid-keys`)
- [ ] Deploy web + worker. Check that `GET /api/health` returns `db: ok` and `worker: ok`.
- [ ] Create the login: `npm run user:create` (one-off job with `BRH_EMAIL`, `BRH_PASSWORD`)
- [ ] Log in, connect Gmail, review the profile
- [ ] Enable database backups (the managed Postgres plan includes daily backups; check retention)
- [ ] Watch the Agent Activity page and the Sources page for the first real alert emails

## Verification status
Nothing has been deployed. The Docker image, the Render blueprint and the GitHub Actions CI workflow have been written but not run here.
