import { desc, eq } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { setViewingStatusAction } from "@/app/actions/inbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { formatDateTime } from "@/lib/utils";

export default async function ViewingsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const rows = await getDb()
    .select({ v: schema.viewingAppointments, a: schema.applications, p: schema.properties })
    .from(schema.viewingAppointments)
    .leftJoin(schema.applications, eq(schema.applications.id, schema.viewingAppointments.applicationId))
    .leftJoin(schema.properties, eq(schema.properties.id, schema.applications.propertyId))
    .where(eq(schema.viewingAppointments.userId, user.id))
    .orderBy(desc(schema.viewingAppointments.createdAt));
  return (
    <div>
      <PageHeader title={t("viewings.title")} subtitle={t("viewings.note")} />
      {!rows.length ? (
        <EmptyState icon={CalendarCheck} title={t("viewings.empty")} />
      ) : (
        <div className="space-y-3">
          {rows.map(({ v, p }) => (
            <Card key={v.id}>
              <CardContent className="space-y-2 pt-4 sm:pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={v.status === "ACCEPTED_BY_USER" ? "success" : v.status === "DECLINED" ? "neutral" : "primary"}>{t(`viewings.status.${v.status}`)}</Badge>
                  {p ? <Link className="ltr-text font-medium text-primary" href={`/apartments/${p.id}`}>{p.title}</Link> : null}
                </div>
                <p className="text-sm">
                  <span className="text-muted">{t("viewings.when")}: </span>
                  {v.proposedAt ? formatDateTime(v.proposedAt, locale) : null}
                  {v.proposedText ? <span className="ltr-text ms-1 text-muted" lang="de">({v.proposedText})</span> : null}
                </p>
                {v.location ? <p className="text-sm"><span className="text-muted">{t("viewings.where")}: </span><span className="ltr-text">{v.location}</span></p> : null}
                <div className="flex flex-wrap gap-2">
                  {(["ACCEPTED_BY_USER", "DECLINED"] as const).map((s) => (
                    <form key={s} action={setViewingStatusAction}>
                      <input type="hidden" name="viewingId" value={v.id} />
                      <input type="hidden" name="status" value={s} />
                      <Button size="sm" variant={s === "ACCEPTED_BY_USER" ? "default" : "outline"} disabled={v.status === s}>
                        {s === "ACCEPTED_BY_USER" ? t("viewings.accept") : t("viewings.decline")}
                      </Button>
                    </form>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
