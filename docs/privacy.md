# Privacy & security

- **Authentication:** a single private account (no public sign-up). Passwords use bcrypt (cost 12). Sessions are HS256 JWTs bound to a revocable `sessions` row, in httpOnly SameSite=Lax cookies. Failed logins are rate-limited (10 per IP per 15 min). The Proxy does an optimistic check, and every page, action and API route is authorized server-side.
- **Data isolation:** every query is scoped by `user_id`. Ownership is re-checked in every action and route.
- **Secrets:** environment variables only, `.env*` is git-ignored. Gmail refresh tokens and uploaded documents are encrypted with AES-256-GCM (`APP_ENCRYPTION_KEY`).
- **Documents:** magic-byte type check (PDF/PNG/JPEG), 10 MB limit, encrypted at rest in PostgreSQL, served with `no-store` + sandbox CSP. Every view, upload and delete is audit-logged. Documents are **never** attached or sent automatically. Auto-deletion at the retention date is NOT_STARTED; delete them manually for now.
- **Nationality:** stored only in `applicant_profiles.private_notes`. It is never used in generated text, and the validator blocks nationality terms.
- **Data minimization:** from the mailbox, only listing alerts and replies to your applications are stored. Other emails are not stored.
- **Export & deletion:** Settings → export everything as JSON, or delete the account (cascades to all data).
- **AI safety:** listing and email text is passed as untrusted data inside tags. Outputs are schema-validated. Extracted facts need verbatim evidence. AI never decides eligibility or sending. Personalization sentences are filtered (no numbers, links, claims or prices). There is a monthly spend cap.
- **Fraud screening:** payment before viewing, untraceable payment methods, "landlord abroad / keys by post", ID requests before a viewing, moves to messengers, and shortened or IP links are flagged. Such senders are blocked as recipients.
- **Logging:** structured JSON logs with secret-looking keys redacted.
- **Headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a restrictive `Permissions-Policy`.
