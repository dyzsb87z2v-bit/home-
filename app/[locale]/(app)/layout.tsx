import { and, count, eq, isNull } from "drizzle-orm";
import { setRequestLocale } from "next-intl/server";
import { logoutAction } from "@/app/actions/auth";
import { Shell } from "@/components/layout/shell";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [{ n }] = (await getDb()
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)))) as [{ n: number }];
  return (
    <Shell unread={n} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
