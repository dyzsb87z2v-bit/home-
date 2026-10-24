import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteAccountAction, disconnectEmailAction } from "@/app/actions/inbox";
import { logoutOtherSessionsAction, saveNotificationPrefsAction, setThemeAction } from "@/app/actions/preferences";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { formatDateTime } from "@/lib/utils";
import { getPreferences } from "@/features/matching/preferences";
import { NOTIFICATION_CATEGORIES } from "@/features/notifications/service";
import { gmailConfigured } from "@/integrations/email/gmail";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const emailResult = (await searchParams).email;
  const db = getDb();
  const [accounts, prefs, sessions] = await Promise.all([
    db.select().from(schema.emailAccounts).where(eq(schema.emailAccounts.userId, user.id)),
    getPreferences(db, user.id),
    db.select().from(schema.sessions).where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date()))).orderBy(desc(schema.sessions.createdAt)),
  ]);
  const np = prefs.notificationPrefs ?? {};

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("settings.title")} />

      <Card>
        <CardHeader><CardTitle>{t("settings.language")}</CardTitle></CardHeader>
        <CardContent className="max-w-xs"><LanguageSwitch /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("settings.theme")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["system", "light", "dark"] as const).map((th) => (
            <form key={th} action={setThemeAction}>
              <input type="hidden" name="theme" value={th} />
              <Button variant={user.theme === th ? "default" : "outline"} size="sm">{t(`settings.theme${th[0]!.toUpperCase()}${th.slice(1)}`)}</Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("settings.email")}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {emailResult ? <p className={emailResult === "connected" ? "text-success" : "text-danger"}>{emailResult}</p> : null}
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="ltr-text font-medium">{a.emailAddress}</span> <Badge tone={a.status === "CONNECTED" ? "success" : "warning"}>{a.status}</Badge>
                {a.lastError ? <p className="text-xs text-danger">{a.lastError}</p> : null}
                {a.lastSyncAt ? <p className="text-xs text-muted">{formatDateTime(a.lastSyncAt, locale)}</p> : null}
              </div>
              {a.status !== "DISCONNECTED" ? (
                <form action={disconnectEmailAction}>
                  <input type="hidden" name="accountId" value={a.id} />
                  <Button size="sm" variant="outline">{t("settings.disconnect")}</Button>
                </form>
              ) : null}
            </div>
          ))}
          {gmailConfigured() ? (
            <a href="/api/email/google/start" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg">{t("inbox.connect")}</a>
          ) : (
            <p className="text-muted">{t("inbox.notConfigured")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("settings.push")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} />
          <p className="text-xs text-muted">{t("settings.install")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("settings.notifications")}</CardTitle></CardHeader>
        <CardContent>
          <form action={saveNotificationPrefsAction} className="space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1 text-start font-medium" />
                  <th className="w-20 py-1 font-medium">{t("settings.channelInApp")}</th>
                  <th className="w-20 py-1 font-medium">{t("settings.channelPush")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {NOTIFICATION_CATEGORIES.map((c) => (
                  <tr key={c}>
                    <td className="py-2">{t(`notifications.${c}`, { title: "…", warm: "…", subject: "…", when: "…", code: "…", to: "…" })}</td>
                    <td className="text-center"><input type="checkbox" name={`${c}.inApp`} defaultChecked={np[c]?.inApp ?? true} className="h-5 w-5" aria-label={t("settings.channelInApp")} /></td>
                    <td className="text-center"><input type="checkbox" name={`${c}.push`} defaultChecked={np[c]?.push ?? true} className="h-5 w-5" aria-label={t("settings.channelPush")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button size="sm">{t("app.save")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("settings.sessions")}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="space-y-1 text-xs text-muted">
            {sessions.map((s) => <li key={s.id}>{formatDateTime(s.createdAt, locale)} — <span className="ltr-text">{s.userAgent?.slice(0, 80)}</span></li>)}
          </ul>
          <form action={logoutOtherSessionsAction}><Button size="sm" variant="outline">{t("settings.logoutAll")}</Button></form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("settings.privacy")}</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <a href="/api/export" className="inline-flex min-h-10 items-center rounded-lg border border-border px-4">{t("settings.export")}</a>
          <form action={deleteAccountAction} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="confirmDelete" className="mb-1 block text-xs text-muted">{t("settings.deleteConfirm")}</label>
              <Input id="confirmDelete" name="confirm" dir="ltr" autoComplete="off" />
            </div>
            <Button variant="danger">{t("settings.deleteAccount")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
