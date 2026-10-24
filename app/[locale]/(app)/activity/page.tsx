import { desc, eq } from "drizzle-orm";
import { Activity } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { actionKey } from "@/lib/localization/activity";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { formatDateTime } from "@/lib/utils";

const PAGE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const rows = await getDb()
    .select({ a: schema.activityLogs, p: { id: schema.properties.id, title: schema.properties.title }, s: { name: schema.rentalSources.name } })
    .from(schema.activityLogs)
    .leftJoin(schema.properties, eq(schema.properties.id, schema.activityLogs.propertyId))
    .leftJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.activityLogs.sourceId))
    .where(eq(schema.activityLogs.userId, user.id))
    .orderBy(desc(schema.activityLogs.at))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const tone = (r: string) => (r === "SUCCESS" ? "success" : r === "FAILURE" ? "danger" : r === "WARNING" ? "warning" : "neutral");
  return (
    <div>
      <PageHeader title={t("activity.title")} subtitle={t("activity.subtitle")} />
      {!rows.length ? (
        <EmptyState icon={Activity} title={t("activity.empty")} />
      ) : (
        <Card>
          <ol className="divide-y divide-border">
            {rows.slice(0, PAGE).map(({ a, p, s }) => (
              <li key={a.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone(a.result)}>{t(`activity.result.${a.result}`)}</Badge>
                  <span className="font-medium">{t.has(actionKey(a.action)) ? t(actionKey(a.action)) : a.action}</span>
                  <time className="ms-auto text-xs text-muted" dateTime={a.at.toISOString()}>{formatDateTime(a.at, locale)}</time>
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {p?.id ? <Link className="ltr-text text-primary underline" href={`/apartments/${p.id}`}>{p.title ?? p.id}</Link> : null}
                  {s?.name ? <span>{t("listing.source")}: {s.name}</span> : null}
                  {a.details && typeof a.details.reason === "string" ? <span className="ltr-text">{a.details.reason}</span> : null}
                  {a.details && typeof a.details.code === "string" ? <span className="ltr-text">{a.details.code}</span> : null}
                </div>
                {a.error ? <p className="ltr-text text-xs text-danger">{a.error}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      )}
      <div className="mt-3 flex justify-between text-sm">
        {page > 1 ? <Link className="text-primary" href={`?page=${page - 1}`}>← {t("app.back")}</Link> : <span />}
        {rows.length > PAGE ? <Link className="text-primary" href={`?page=${page + 1}`}>{t("app.more")} →</Link> : null}
      </div>
    </div>
  );
}
