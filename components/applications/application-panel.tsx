import { AlertTriangle, ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { markSubmittedAction, resolveUncertainAction, sendApplicationAction, sendFollowUpAction, updateDraftAction } from "@/app/actions/applications";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import type { schema } from "@/lib/database/client";
import { formatDateTime } from "@/lib/utils";

type App = typeof schema.applications.$inferSelect;

export function statusTone(s: App["status"]) {
  return s === "SENT" || s === "SUBMITTED_MANUALLY" ? "success" : s === "FAILED" ? "danger" : s === "UNCERTAIN" ? "warning" : "neutral";
}

export async function ApplicationPanel({
  app,
  events,
  replies,
  followUps,
  viewings,
  listingUrl,
}: {
  app: App;
  events: Array<typeof schema.applicationEvents.$inferSelect>;
  replies: Array<{ r: typeof schema.landlordReplies.$inferSelect; m: typeof schema.emailMessages.$inferSelect }>;
  followUps: Array<typeof schema.followUps.$inferSelect>;
  viewings: Array<typeof schema.viewingAppointments.$inferSelect>;
  listingUrl: string | null;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const editable = app.status === "DRAFT" || app.status === "FAILED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={statusTone(app.status)}>{t(`applications.status.${app.status}`)}</Badge>
        <span className="text-muted">{t("applications.channel")}: {t(`applications.channel${app.channel}`)}</span>
        <span className="text-muted">
          {t("applications.recipient")}: <span className="ltr-text">{app.recipient.startsWith("property:") ? "—" : app.recipient}</span>
        </span>
        {app.submittedAt ? <span className="text-muted">{t("applications.submittedAt")}: {formatDateTime(app.submittedAt, locale)}</span> : null}
        <span className="text-muted">{t("applications.generatedBy")}: {app.generatedBy}</span>
      </div>

      {app.validation ? (
        <p className={`text-sm ${app.validation.ok ? "text-success" : "text-danger"}`}>
          {app.validation.ok ? t("applications.validationOk") : t("applications.validationIssues", { issues: app.validation.issues.join(", ") })}
        </p>
      ) : null}
      {app.lastError ? <p className="text-sm text-danger">{app.lastError}</p> : null}

      {app.status === "UNCERTAIN" ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden /> {t("applications.uncertain")}</p>
          <div className="flex gap-2">
            <form action={resolveUncertainAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="wasSent" value="true" />
              <Button size="sm" variant="outline">{t("applications.resolveSent")}</Button>
            </form>
            <form action={resolveUncertainAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="wasSent" value="false" />
              <Button size="sm" variant="outline">{t("applications.resolveNotSent")}</Button>
            </form>
          </div>
        </div>
      ) : null}

      {editable ? (
        <ActionForm action={updateDraftAction} submitLabel={t("app.save")} variant="outline" hidden={{ applicationId: app.id }}>
          <Field label={t("applications.subject")} htmlFor={`subj-${app.id}`}>
            <Input id={`subj-${app.id}`} name="subject" defaultValue={app.subject} dir="ltr" lang="de" />
          </Field>
          <Field label={t("applications.bodyDe")} htmlFor={`body-${app.id}`}>
            <Textarea id={`body-${app.id}`} name="bodyDe" defaultValue={app.bodyDe} rows={16} dir="ltr" lang="de" className="font-[Inter]" />
          </Field>
        </ActionForm>
      ) : (
        <div>
          <div className="mb-1 text-sm font-medium">{t("applications.bodyDe")}</div>
          <pre className="ltr-text whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-sm" lang="de">{`${app.subject}\n\n${app.bodyDe}`}</pre>
        </div>
      )}

      {app.bodyFa ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">{t("applications.bodyFa")}</summary>
          <p className="mt-2 whitespace-pre-line text-sm" dir="rtl" lang="fa">{app.bodyFa}</p>
        </details>
      ) : null}

      {editable && app.channel === "EMAIL" ? (
        <ActionForm action={sendApplicationAction} submitLabel={t("applications.send")} variant="success" hidden={{ applicationId: app.id }} successText={t("applications.status.SENT")}>
          <Checkbox name="confirm" required label={t("applications.sendConfirm")} />
        </ActionForm>
      ) : null}

      {editable && app.channel === "MANUAL" ? (
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <p>{t("applications.manualHint")}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={`${app.subject}\n\n${app.bodyDe}`} />
            {listingUrl && /^https?:\/\//.test(listingUrl) ? (
              <a className="inline-flex min-h-8 items-center rounded-lg border border-border px-3 text-xs" href={listingUrl} target="_blank" rel="noopener noreferrer nofollow">
                {t("listing.originalListing")}
              </a>
            ) : null}
            <form action={markSubmittedAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <Button size="sm">{t("applications.markSubmitted")}</Button>
            </form>
          </div>
        </div>
      ) : null}

      {replies.length ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("nav.replies")}</div>
          {replies.map(({ r, m }) => (
            <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone={r.suspicious ? "danger" : "primary"}>{t(`replies.categories.${r.category}`)}</Badge>
                <span className="text-xs text-muted">{formatDateTime(m.receivedAt, locale)}</span>
              </div>
              {r.suspicious ? <p className="mb-1 flex items-center gap-1 text-danger"><ShieldAlert className="h-4 w-4" aria-hidden /> {t("replies.suspicious")}</p> : null}
              {r.summaryFa ? <p dir="rtl" lang="fa">{r.summaryFa}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {viewings.length ? (
        <div className="text-sm">
          <div className="font-medium">{t("nav.viewings")}</div>
          {viewings.map((v) => (
            <p key={v.id}>{v.proposedAt ? formatDateTime(v.proposedAt, locale) : <span className="ltr-text">{v.proposedText}</span>} — {t(`viewings.status.${v.status}`)}</p>
          ))}
        </div>
      ) : null}

      {followUps.length ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("applications.followUps")}</div>
          {followUps.map((f) => (
            <div key={f.id} className="rounded-lg border border-border p-3 text-sm">
              <Badge tone={statusTone(f.status)}>{t(`applications.status.${f.status}`)}</Badge>
              <pre className="ltr-text mt-2 whitespace-pre-wrap font-sans" lang="de">{f.bodyDe}</pre>
              {f.status === "DRAFT" ? (
                <form action={sendFollowUpAction} className="mt-2 space-y-2">
                  <input type="hidden" name="followUpId" value={f.id} />
                  <Checkbox name="confirm" required label={t("applications.sendConfirm")} />
                  <Button size="sm">{t("applications.sendFollowUp")}</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {events.length ? (
        <details>
          <summary className="cursor-pointer text-sm text-muted">{t("applications.events")}</summary>
          <ol className="mt-2 space-y-1 border-s border-border ps-4 text-xs text-muted">
            {events.map((e) => (
              <li key={e.id}>
                {formatDateTime(e.at, locale)} — {e.type}
                {e.payload && "code" in e.payload ? ` (${String(e.payload.code)})` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
