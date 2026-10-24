import { desc, eq } from "drizzle-orm";
import { MessageSquareReply, ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { markReplyHandledAction } from "@/app/actions/inbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { formatDateTime } from "@/lib/utils";

export default async function RepliesPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const rows = await getDb()
    .select({ r: schema.landlordReplies, m: schema.emailMessages, a: schema.applications })
    .from(schema.landlordReplies)
    .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.landlordReplies.messageId))
    .leftJoin(schema.applications, eq(schema.applications.id, schema.landlordReplies.applicationId))
    .where(eq(schema.landlordReplies.userId, user.id))
    .orderBy(desc(schema.emailMessages.receivedAt))
    .limit(100);
  return (
    <div>
      <PageHeader title={t("replies.title")} />
      {!rows.length ? (
        <EmptyState icon={MessageSquareReply} title={t("replies.empty")} />
      ) : (
        <div className="space-y-3">
          {rows.map(({ r, m, a }) => (
            <Card key={r.id} className={r.handled ? "opacity-70" : undefined}>
              <CardContent className="space-y-3 pt-4 sm:pt-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={r.suspicious ? "danger" : r.category === "VIEWING_INVITATION" ? "success" : r.category === "REJECTED" || r.category === "APARTMENT_RENTED" ? "neutral" : "primary"}>
                    {t(`replies.categories.${r.category}`)}
                  </Badge>
                  <span>{formatDateTime(m.receivedAt, locale)}</span>
                  <span className="ltr-text">{m.fromAddress}</span>
                  <span>{t("replies.classifiedBy", { by: r.classifiedBy })}</span>
                  {a ? <Link className="text-primary underline" href={`/apartments/${a.propertyId}`}>{t("nav.apartments")}</Link> : null}
                </div>
                {r.suspicious ? (
                  <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                    <p className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" aria-hidden /> {t("replies.suspicious")}</p>
                    {r.suspiciousReasons.length ? (
                      <ul className="mt-1 list-disc ps-5">
                        {r.suspiciousReasons.map((s) => <li key={s}>{t.has(`replies.signals.${s}`) ? t(`replies.signals.${s}`) : s}</li>)}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <div className="ltr-text font-medium" lang="de">{m.subject}</div>
                {r.summaryFa ? (
                  <div className="text-sm">
                    <div className="text-xs text-muted">{t("replies.summary")}</div>
                    <p dir="rtl" lang="fa">{r.summaryFa}</p>
                  </div>
                ) : null}
                {r.suggestedAction ? (
                  <div className="text-sm">
                    <div className="text-xs text-muted">{t("replies.suggested")}</div>
                    <p dir="rtl" lang="fa">{r.suggestedAction}</p>
                  </div>
                ) : null}
                <details>
                  <summary className="cursor-pointer text-sm text-muted">{t("inbox.original")}</summary>
                  <pre className="ltr-text mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm" lang="de">{m.bodyText}</pre>
                </details>
                {m.bodyFa ? (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted">{t("inbox.translation")}</summary>
                    <p className="mt-2 whitespace-pre-line text-sm" dir="rtl" lang="fa">{m.bodyFa}</p>
                  </details>
                ) : null}
                {!r.handled ? (
                  <form action={markReplyHandledAction}>
                    <input type="hidden" name="replyId" value={r.id} />
                    <Button size="sm" variant="outline">{t("replies.markHandled")}</Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
