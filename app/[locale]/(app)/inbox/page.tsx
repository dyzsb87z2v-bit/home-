import { desc, eq } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { syncEmailNowAction } from "@/app/actions/inbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { formatDateTime } from "@/lib/utils";

export default async function InboxPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const db = getDb();
  const accounts = await db.select().from(schema.emailAccounts).where(eq(schema.emailAccounts.userId, user.id));
  const connected = accounts.find((a) => a.status === "CONNECTED");
  const rows = await db
    .select({ m: schema.emailMessages, th: schema.emailThreads })
    .from(schema.emailMessages)
    .innerJoin(schema.emailThreads, eq(schema.emailThreads.id, schema.emailMessages.threadId))
    .innerJoin(schema.emailAccounts, eq(schema.emailAccounts.id, schema.emailThreads.accountId))
    .where(eq(schema.emailAccounts.userId, user.id))
    .orderBy(desc(schema.emailMessages.receivedAt))
    .limit(100);
  return (
    <div>
      <PageHeader
        title={t("inbox.title")}
        subtitle={t("inbox.subtitle")}
        actions={
          connected ? (
            <form action={syncEmailNowAction}>
              <Button variant="outline" size="sm">{t("inbox.syncNow")}</Button>
            </form>
          ) : (
            <Link href="/settings" className="text-sm text-primary underline">{t("inbox.connect")}</Link>
          )
        }
      />
      {!rows.length ? (
        <EmptyState icon={Inbox} title={t("inbox.empty")} />
      ) : (
        <div className="space-y-3">
          {rows.map(({ m, th }) => (
            <Card key={m.id}>
              <CardContent className="space-y-2 pt-4 sm:pt-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={m.isListingAlert ? "neutral" : "primary"}>{m.isListingAlert ? t("inbox.alert") : t("inbox.reply")}</Badge>
                  <span className="ltr-text">{m.fromAddress}</span>
                  <span>{formatDateTime(m.receivedAt, locale)}</span>
                  {th.propertyId ? <Link className="text-primary underline" href={`/apartments/${th.propertyId}`}>{t("nav.apartments")}</Link> : null}
                </div>
                <div className="ltr-text font-medium" lang="de">{m.subject}</div>
                <details>
                  <summary className="cursor-pointer text-sm text-muted">{t("inbox.original")}</summary>
                  <pre className="ltr-text mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm" lang="de">{m.bodyText}</pre>
                </details>
                {m.bodyFa ? (
                  <details open>
                    <summary className="cursor-pointer text-sm text-muted">{t("inbox.translation")}</summary>
                    <p className="mt-2 whitespace-pre-line text-sm" dir="rtl" lang="fa">{m.bodyFa}</p>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
