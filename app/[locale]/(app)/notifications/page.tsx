import { desc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { markAllNotificationsReadAction } from "@/app/actions/inbox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { cn, formatDateTime } from "@/lib/utils";

export default async function NotificationsPage() {
  const user = await requireUser();
  const t = await getTranslations("notifications");
  const locale = await getLocale();
  const rows = await getDb().select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  const text = (n: (typeof rows)[number]) => {
    const vals = Object.fromEntries(Object.entries(n.payload).map(([k, v]) => [k, v == null ? "?" : String(v)]));
    return t.has(n.category) ? t(n.category, { title: "", warm: "", subject: "", when: "", code: "", to: "", ...vals }) : n.category;
  };
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t("title")}
        actions={rows.some((r) => !r.readAt) ? <form action={markAllNotificationsReadAction}><Button size="sm" variant="outline">{t("markAllRead")}</Button></form> : null}
      />
      {!rows.length ? (
        <EmptyState icon={Bell} title={t("empty")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={cn("p-4 text-sm", !n.readAt && "bg-primary/5")}>
                <div className="flex items-start justify-between gap-3">
                  {n.link ? <Link className="font-medium hover:underline" href={n.link}>{text(n)}</Link> : <span className="font-medium">{text(n)}</span>}
                  <time className="shrink-0 text-xs text-muted">{formatDateTime(n.createdAt, locale)}</time>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
