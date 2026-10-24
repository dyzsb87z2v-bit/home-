import { and, eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { addFeedAction, syncNowAction, toggleConnectionAction } from "@/app/actions/sources";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { cn, formatDateTime, formatNum } from "@/lib/utils";
import { displayState, type DisplayState } from "@/features/sources/status";

const TONE: Record<DisplayState, "success" | "primary" | "warning" | "neutral" | "danger"> = {
  CONNECTED: "success",
  ALERTS_ONLY: "primary",
  PARTIALLY_CONNECTED: "warning",
  MANUAL_ONLY: "neutral",
  UNAVAILABLE: "danger",
  DISABLED: "neutral",
};

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const filter = (await searchParams).state as DisplayState | undefined;
  const db = getDb();
  const [sources, conns, counts] = await Promise.all([
    db.select().from(schema.rentalSources).orderBy(schema.rentalSources.category, schema.rentalSources.name),
    db.select().from(schema.sourceConnections).where(eq(schema.sourceConnections.userId, user.id)),
    db
      .select({
        sourceId: schema.propertySourceLinks.sourceId,
        total: sql<number>`count(distinct ${schema.properties.id})::int`,
        eligible: sql<number>`count(distinct ${schema.properties.id}) filter (where ${schema.properties.eligibility} = 'ELIGIBLE')::int`,
      })
      .from(schema.propertySourceLinks)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.propertySourceLinks.propertyId))
      .where(and(eq(schema.propertySourceLinks.userId, user.id)))
      .groupBy(schema.propertySourceLinks.sourceId),
  ]);
  const visible = sources.filter((s) => s.slug !== "test-provider" || process.env.APP_ENV !== "production");
  const rows = visible.map((s) => {
    const cs = conns.filter((c) => c.sourceId === s.id);
    const ds = displayState(s.operationalState, cs);
    const lastSuccess = cs.map((c) => c.lastSuccessAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    const err = cs.find((c) => c.lastError)?.lastError ?? null;
    const n = counts.find((c) => c.sourceId === s.id);
    return { s, cs, ds, lastSuccess, err, total: n?.total ?? 0, eligible: n?.eligible ?? 0 };
  });
  const shown = filter ? rows.filter((r) => r.ds.state === filter) : rows;
  const states: DisplayState[] = ["CONNECTED", "ALERTS_ONLY", "PARTIALLY_CONNECTED", "MANUAL_ONLY", "UNAVAILABLE", "DISABLED"];

  return (
    <div>
      <PageHeader title={t("sources.title")} subtitle={t("sources.subtitle")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/sources" className={cn("rounded-full border px-3 py-1.5 text-sm", !filter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>
          {t("sources.filterAll")} ({rows.length})
        </Link>
        {states.map((st) => (
          <Link key={st} href={`/sources?state=${st}`} className={cn("rounded-full border px-3 py-1.5 text-sm", filter === st ? "border-primary bg-primary/10 text-primary" : "border-border text-muted")}>
            {t(`sources.state.${st}`)} ({rows.filter((r) => r.ds.state === st).length})
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">{t("sources.alertsHint")}</p>
      <div className="space-y-3">
        {shown.map(({ s, cs, ds, lastSuccess, err, total, eligible }) => (
          <Card key={s.id}>
            <CardContent className="space-y-3 pt-4 sm:pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="ltr-text block truncate text-xs text-primary underline">{s.url}</a>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={TONE[ds.state]}>{t(`sources.state.${ds.state}`)}</Badge>
                  <Badge>{t(`sources.category.${s.category}`)}</Badge>
                </div>
              </div>
              {ds.awaiting ? <p className="text-xs text-warning">{t("sources.awaitingAlerts")}</p> : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                <div><dt className="text-muted">{t("sources.lastSync")}</dt><dd>{formatDateTime(lastSuccess, locale) ?? t("sources.never")}</dd></div>
                <div><dt className="text-muted">{t("sources.listings")} / {t("sources.eligible")}</dt><dd>{formatNum(total, locale)} / {formatNum(eligible, locale)}</dd></div>
                <div><dt className="text-muted">{t("sources.capability")}</dt><dd className="ltr-text">{s.integrationMethods.join(", ")}</dd></div>
                <div><dt className="text-muted">{t("sources.application")}</dt><dd>{t(`sources.submission.${s.submissionCapability}`)}</dd></div>
                {cs.length ? <div><dt className="text-muted">{t("sources.interval")}</dt><dd>{cs.map((c) => `${c.adapter}: ${t("sources.every", { minutes: c.intervalMinutes })}`).join(" · ")}</dd></div> : null}
                <div className="col-span-2 sm:col-span-3"><dt className="text-muted">{t("sources.spandau")}</dt><dd>{s.coverage}</dd></div>
              </dl>
              {err ? <p className="text-xs text-danger">{t("sources.error")}: {err}</p> : null}
              {s.verificationNote ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">{t("sources.verification")}</summary>
                  <p className="ltr-text mt-1">{s.verificationNote}</p>
                </details>
              ) : null}
              {s.operationalState !== "UNAVAILABLE" ? (
                <div className="flex flex-wrap items-center gap-2">
                  {cs.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <form action={toggleConnectionAction}>
                        <input type="hidden" name="connectionId" value={c.id} />
                        <Button size="sm" variant={c.enabled ? "outline" : "default"}>
                          {c.adapter}: {c.enabled ? t("automation.off") : t("automation.on")}
                        </Button>
                      </form>
                      {c.enabled && (c.adapter === "feed" || c.adapter === "test") ? (
                        <form action={syncNowAction}>
                          <input type="hidden" name="connectionId" value={c.id} />
                          <Button size="sm" variant="ghost">{t("sources.syncNow")}</Button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                  {s.slug !== "manual" ? (
                    <details className="w-full">
                      <summary className="cursor-pointer text-xs text-muted">{t("sources.addFeed")}</summary>
                      <ActionForm action={addFeedAction} submitLabel={t("sources.addFeed")} variant="outline" hidden={{ sourceId: s.id }} className="mt-2">
                        <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                          <Field label={t("sources.feedUrl")} htmlFor={`feed-${s.id}`}><Input id={`feed-${s.id}`} name="url" type="url" required dir="ltr" placeholder="https://" /></Field>
                          <Field label={t("sources.interval")} htmlFor={`int-${s.id}`}><Input id={`int-${s.id}`} name="intervalMinutes" type="number" min={15} defaultValue={60} /></Field>
                        </div>
                      </ActionForm>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
