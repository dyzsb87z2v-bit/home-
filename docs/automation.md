# Automation

## Modes
- **A — Discovery only:** monitor, extract, dedupe, evaluate, notify. Never drafts or sends.
- **B — Automatic drafting:** for every newly ELIGIBLE listing, create a validated German draft (plus a Persian translation). You send it yourself, by email in one click with a confirmation checkbox, or through the portal form.
- **C — Authorized auto-apply:** sends automatically, but only when all of the following hold:
  - the master switch is ON (default OFF), and
  - a stored authorization exists. It is created on the Automation page, names the email account, the channel (email only), the listings (ELIGIBLE only, ≤ €1,200 warm), a daily maximum and a minimum score, and "never attachments". Its exact statement is written to the audit log.
  - Pausing is instant. Revoking deletes the authorization and drops back to mode B.

## What is never automated
Document sharing, attachments, accepting or confirming viewings, contracts, payments, and replying to landlords beyond the configured polite follow-up. Suspicious senders (payment before viewing, Western Union / crypto, landlord abroad with keys by post) are flagged and blocked as recipients.

## Follow-ups
After *N* days without any reply (default 5), one polite follow-up draft is prepared (max configurable 0–3). It is sent automatically only if auto-follow-up is on **and** auto-apply is authorized. Never after a rejection, a "rented" notice or a stop-contact request.

## Monitoring frequency
- Feeds: the user-chosen interval, but never faster than the source's `min_interval_minutes` (default 60). Exponential backoff on errors, capped at 24 h. `robots.txt` is honoured and 403/robots blocks are permanent stops.
- Email: Gmail is polled every 5 minutes. Alerts arrive as fast as each portal sends them.
- No second-by-second monitoring is claimed or attempted.
