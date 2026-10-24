import { desc, eq } from "drizzle-orm";
import { Send } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { statusTone } from "@/components/applications/application-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { formatDateTime, formatEur } from "@/lib/utils";

export default async function ApplicationsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const rows = await getDb()
    .select({ a: schema.applications, p: schema.properties })
    .from(schema.applications)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.applications.propertyId))
    .where(eq(schema.applications.userId, user.id))
    .orderBy(desc(schema.applications.updatedAt))
    .limit(200);
  return (
    <div>
      <PageHeader title={t("applications.title")} />
      {!rows.length ? (
        <EmptyState icon={Send} title={t("applications.empty")} />
      ) : (
        <Card className="overflow-hidden">
          <table className="hidden w-full text-sm md:table">
            <thead className="bg-surface-2 text-start text-xs text-muted">
              <tr>
                <th className="p-3 text-start font-medium">{t("nav.apartments")}</th>
                <th className="p-3 text-start font-medium">{t("listing.warm")}</th>
                <th className="p-3 text-start font-medium">{t("applications.channel")}</th>
                <th className="p-3 text-start font-medium">{t("sources.status")}</th>
                <th className="p-3 text-start font-medium">{t("applications.submittedAt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ a, p }) => (
                <tr key={a.id} className="hover:bg-surface-2">
                  <td className="max-w-80 p-3">
                    <Link href={`/apartments/${p.id}`} className="ltr-text line-clamp-1 font-medium text-primary">{p.title ?? p.id}</Link>
                  </td>
                  <td className="p-3">{formatEur(p.warmRentEur, locale) ?? "—"}</td>
                  <td className="p-3">{t(`applications.channel${a.channel}`)}</td>
                  <td className="p-3"><Badge tone={statusTone(a.status)}>{t(`applications.status.${a.status}`)}</Badge>{a.autoSubmitted ? <Badge className="ms-1">auto</Badge> : null}</td>
                  <td className="p-3 text-muted">{formatDateTime(a.submittedAt, locale) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-border md:hidden">
            {rows.map(({ a, p }) => (
              <li key={a.id}>
                <Link href={`/apartments/${p.id}`} className="block space-y-1 p-4">
                  <div className="ltr-text line-clamp-2 font-medium">{p.title ?? p.id}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={statusTone(a.status)}>{t(`applications.status.${a.status}`)}</Badge>
                    <span>{formatEur(p.warmRentEur, locale) ?? "—"}</span>
                    <span>{formatDateTime(a.submittedAt, locale)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
