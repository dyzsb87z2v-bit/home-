import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Activity, AlertTriangle, CheckCircle2, Home, Search, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PropertyCard } from "@/components/apartment/property-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { countByEligibility, listProperties } from "@/lib/data/properties";
import { Link } from "@/lib/localization/navigation";
import { formatDateTime, formatNum } from "@/lib/utils";
import { aiConfigured } from "@/integrations/ai/claude";
import { getPreferences } from "@/features/matching/preferences";

export default async function OverviewPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const db = getDb();
  const [prefs, counts, top, heartbeat, accounts, sentCount, replyCount, viewingCount, recent, activeSources] = await Promise.all([
    getPreferences(db, user.id),
    countByEligibility(user.id),
    listProperties(user.id, { eligibility: ["ELIGIBLE"], sort: "score", limit: 4 }),
    db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, "worker.heartbeat")),
    db.select().from(schema.emailAccounts).where(eq(schema.emailAccounts.userId, user.id)),
    db.select({ n: count() }).from(schema.applications).where(and(eq(schema.applications.userId, user.id), inArray(schema.applications.status, ["SENT", "SUBMITTED_MANUALLY"]))),
    db.select({ n: count() }).from(schema.landlordReplies).where(eq(schema.landlordReplies.userId, user.id)),
    db.select({ n: count() }).from(schema.viewingAppointments).where(and(eq(schema.viewingAppointments.userId, user.id), gte(schema.viewingAppointments.createdAt, sql`now() - interval '60 days'`))),
    db.select().from(schema.activityLogs).where(eq(schema.activityLogs.userId, user.id)).orderBy(desc(schema.activityLogs.at)).limit(6),
    db.select({ n: count() }).from(schema.sourceConnections).where(and(eq(schema.sourceConnections.userId, user.id), eq(schema.sourceConnections.enabled, true), inArray(schema.sourceConnections.state, ["CONNECTED", "ALERTS_ONLY", "PARTIALLY_CONNECTED"]))),
  ]);
  const hb = heartbeat[0]?.value as { at: string } | undefined;
  const hbAge = hb ? Date.now() - new Date(hb.at).getTime() : null;
  const workerOk = hbAge != null && hbAge < 15 * 60_000;
  const account = accounts.find((a) => a.status === "CONNECTED");

  const stats = [
    { label: t("overview.eligible"), value: counts.ELIGIBLE ?? 0, tone: "text-success", href: "/apartments" },
    { label: t("overview.needsVerification"), value: counts.NEEDS_VERIFICATION ?? 0, tone: "text-warning", href: "/feed?e=NEEDS_VERIFICATION" },
    { label: t("overview.rejected"), value: counts.INELIGIBLE ?? 0, tone: "text-muted", href: "/feed?e=INELIGIBLE" },
    { label: t("overview.applicationsSent"), value: sentCount[0]?.n ?? 0, tone: "text-primary", href: "/applications" },
    { label: t("overview.replies"), value: replyCount[0]?.n ?? 0, tone: "text-primary", href: "/replies" },
    { label: t("overview.viewings"), value: viewingCount[0]?.n ?? 0, tone: "text-primary", href: "/viewings" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("overview.title")}
        subtitle={t("overview.criteriaLine", { rent: formatNum(prefs.maxWarmRentEur, locale)!, rooms: formatNum(prefs.minRooms, locale)!, area: formatNum(prefs.minAreaSqm, locale)! })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">{t("overview.mode")}: {t(`automation.modes.${prefs.automationMode}`)}</Badge>
            <Badge tone={prefs.autoApplyEnabled ? "success" : "neutral"}>
              {t("overview.autoApply")}: {prefs.autoApplyEnabled ? t("automation.on") : t("automation.off")}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-2">
            <div className={`text-2xl font-semibold ${s.tone}`}>{formatNum(s.value, locale)}</div>
            <div className="mt-1 text-xs text-muted">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {t("overview.topMatches")}
          </h2>
          {top.length ? (
            top.map((r) => <PropertyCard key={r.p.id} {...r} />)
          ) : (
            <EmptyState icon={Search} title={t("overview.noMatches")} />
          )}
        </section>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.systemHealth")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <HealthRow ok={workerOk} label={t("overview.worker")} text={hb ? (workerOk ? t("overview.workerOk", { time: formatDateTime(hb.at, locale)! }) : t("overview.workerDown")) : t("overview.workerNever")} />
              <HealthRow ok={!!account} label={t("overview.email")} text={account ? t("overview.emailConnected", { address: account.emailAddress }) : t("overview.emailNotConnected")} href="/settings" />
              <HealthRow ok={aiConfigured()} label={t("overview.ai")} text={aiConfigured() ? t("overview.aiOn") : t("overview.aiOff")} neutral />
              <HealthRow ok={(activeSources[0]?.n ?? 0) > 0} label={t("overview.sourcesActive")} text={String(activeSources[0]?.n ?? 0)} href="/sources" />
            </CardContent>
          </Card>

          {!account ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("overview.setupTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-2 ps-5 text-sm">
                  <li>
                    <Link className="text-primary underline" href="/settings">{t("overview.setupEmail")}</Link>
                  </li>
                  <li>
                    <Link className="text-primary underline" href="/sources">{t("overview.setupAlerts")}</Link>
                  </li>
                  <li>
                    <Link className="text-primary underline" href="/profile">{t("overview.setupProfile")}</Link>
                  </li>
                </ol>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" aria-hidden /> {t("overview.recentActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length ? (
                <ul className="space-y-2 text-sm">
                  {recent.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-2">
                      <span>{t.has(`activity.actions.${a.action}`) ? t(`activity.actions.${a.action}`) : a.action}</span>
                      <span className="shrink-0 text-xs text-muted">{formatDateTime(a.at, locale)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("activity.empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ ok, label, text, href, neutral }: { ok: boolean; label: string; text: string; href?: string; neutral?: boolean }) {
  const Icon = ok ? CheckCircle2 : neutral ? Home : AlertTriangle;
  const body = (
    <div className="flex items-start gap-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-success" : neutral ? "text-muted" : "text-warning"}`} aria-hidden />
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-muted">{text}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block rounded-lg hover:bg-surface-2">{body}</Link> : body;
}

