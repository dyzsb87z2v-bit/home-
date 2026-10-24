import { and, eq, gte, sql } from "drizzle-orm";
import { Pause, Play, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { authorizeAutoApplyAction, revokeAutoApplyAction, saveFollowUpAction, setAutoApplyAction, setModeAction } from "@/app/actions/automation";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/empty";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { cn, formatDateTime } from "@/lib/utils";
import { getPreferences } from "@/features/matching/preferences";

export default async function AutomationPage() {
  const user = await requireUser();
  const t = await getTranslations("automation");
  const locale = await getLocale();
  const db = getDb();
  const prefs = await getPreferences(db, user.id);
  const [account] = await db.select().from(schema.emailAccounts).where(and(eq(schema.emailAccounts.userId, user.id), eq(schema.emailAccounts.status, "CONNECTED")));
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [cost] = await db.select({ micro: sql<number>`coalesce(sum(${schema.aiUsage.costMicroUsd}),0)::int` }).from(schema.aiUsage).where(gte(schema.aiUsage.at, monthStart));
  const auth = prefs.autoApplyAuthorization;
  const budget = Number(process.env.AI_MONTHLY_BUDGET_CENTS ?? 2000) / 100;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("title")} />

      <Card>
        <CardHeader className="items-center">
          <CardTitle>{t("master")}</CardTitle>
          <Badge tone={prefs.autoApplyEnabled ? "success" : "neutral"} className="text-sm">{prefs.autoApplyEnabled ? t("on") : t("off")}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {prefs.autoApplyEnabled ? (
            <form action={setAutoApplyAction}>
              <input type="hidden" name="on" value="false" />
              <Button variant="danger" size="lg"><Pause className="h-4 w-4" aria-hidden /> {t("pause")}</Button>
            </form>
          ) : auth ? (
            <form action={setAutoApplyAction}>
              <input type="hidden" name="on" value="true" />
              <Button variant="success" size="lg"><Play className="h-4 w-4" aria-hidden /> {t("on")}</Button>
            </form>
          ) : null}
          {auth ? (
            <form action={revokeAutoApplyAction}>
              <Button variant="outline" size="lg">{t("revoke")}</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("mode")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {(["DISCOVERY", "DRAFTING", "AUTO_APPLY"] as const).map((m) => (
            <form key={m} action={setModeAction}>
              <input type="hidden" name="mode" value={m} />
              <button className={cn("w-full rounded-xl border p-4 text-start transition-colors", prefs.automationMode === m ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2")} aria-pressed={prefs.automationMode === m}>
                <div className="font-medium">{t(`modes.${m}`)}</div>
                <div className="mt-1 text-sm text-muted">{t(`modeHelp.${m}`)}</div>
              </button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" aria-hidden /> {t("authorizeTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {auth ? (
            <>
              <p className="text-success">{t("authorizedAt", { date: formatDateTime(auth.authorizedAt, locale)! })}</p>
              <p className="ltr-text rounded-lg bg-surface-2 p-3 text-xs">{auth.statement}</p>
            </>
          ) : !account ? (
            <p className="text-warning">{t("needEmail")}</p>
          ) : (
            <>
              <p>{t("authorizeIntro")}</p>
              <ul className="list-disc space-y-1 ps-5">
                <li>{t("authorizeAccount", { address: account.emailAddress })}</li>
                <li>{t("authorizeChannel")}</li>
                <li>{t("authorizeListings")}</li>
                <li>{t("authorizeAttachments")}</li>
              </ul>
              <ActionForm action={authorizeAutoApplyAction} submitLabel={t("authorizeSubmit")} variant="success" hidden={{ emailAccountId: account.id }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("maxPerDay")} htmlFor="maxPerDay"><Input id="maxPerDay" name="maxPerDay" type="number" min={1} max={30} defaultValue={10} /></Field>
                  <Field label={t("minScore")} htmlFor="minScore"><Input id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={40} /></Field>
                </div>
                <Checkbox name="confirm" required label={t("authorizeConfirm")} />
              </ActionForm>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("followUpTitle")}</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveFollowUpAction} submitLabel="✓">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("followUpDays")} htmlFor="followUpAfterDays"><Input id="followUpAfterDays" name="followUpAfterDays" type="number" min={2} max={30} defaultValue={prefs.followUpAfterDays} /></Field>
              <Field label={t("maxFollowUps")} htmlFor="maxFollowUps"><Input id="maxFollowUps" name="maxFollowUps" type="number" min={0} max={3} defaultValue={prefs.maxFollowUps} /></Field>
            </div>
            <Checkbox name="autoFollowUp" defaultChecked={prefs.autoFollowUp} label={t("autoFollowUp")} />
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("cost")}</CardTitle></CardHeader>
        <CardContent className="text-sm">{t("costValue", { amount: ((cost?.micro ?? 0) / 1_000_000).toFixed(2), budget: budget.toFixed(2) })}</CardContent>
      </Card>
    </div>
  );
}
