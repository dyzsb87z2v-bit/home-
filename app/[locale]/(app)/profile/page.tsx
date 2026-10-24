import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { saveProfileAction } from "@/app/actions/profile";
import { saveSearchPreferencesAction } from "@/app/actions/preferences";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/empty";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { getPreferences } from "@/features/matching/preferences";
import { FACT_KEYS } from "@/features/users/facts";

export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getTranslations("profile");
  const tApp = await getTranslations("app");
  const db = getDb();
  const [[profile], [household], prefs] = await Promise.all([
    db.select().from(schema.applicantProfiles).where(eq(schema.applicantProfiles.userId, user.id)),
    db.select().from(schema.households).where(eq(schema.households.userId, user.id)),
    getPreferences(db, user.id),
  ]);
  if (!profile || !household) return <p>{t("subtitle")}</p>;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Card>
        <CardContent className="pt-4 sm:pt-5">
          <ActionForm action={saveProfileAction} submitLabel={tApp("save")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fullName")} htmlFor="fullName"><Input id="fullName" name="fullName" defaultValue={profile.fullName} required /></Field>
              <Field label={t("contactEmail")} htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" dir="ltr" defaultValue={profile.contactEmail ?? ""} /></Field>
              <Field label={t("phone")} htmlFor="phone"><Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={profile.phone ?? ""} /></Field>
            </div>
            <fieldset className="space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">{t("household")}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("adults")} htmlFor="adults"><Input id="adults" name="adults" type="number" min={1} defaultValue={household.adults} /></Field>
                <Field label={t("children")} htmlFor="children"><Input id="children" name="children" type="number" min={0} defaultValue={household.children} /></Field>
                <Field label={t("childAges")} htmlFor="childAges"><Input id="childAges" name="childAges" dir="ltr" defaultValue={household.childAges.join(", ")} /></Field>
                <Field label={t("income")} htmlFor="monthlyNetIncomeEur"><Input id="monthlyNetIncomeEur" name="monthlyNetIncomeEur" inputMode="numeric" defaultValue={household.monthlyNetIncomeEur ?? ""} /></Field>
                <Field label={t("schufa")} htmlFor="schufaAvailable">
                  <Select id="schufaAvailable" name="schufaAvailable" defaultValue={profile.schufaAvailable}>
                    <option value="UNKNOWN">—</option>
                    <option value="YES">✓</option>
                    <option value="NO">✕</option>
                  </Select>
                </Field>
              </div>
              <Checkbox name="incomeVerified" defaultChecked={household.incomeVerified} label={t("incomeVerified")} />
            </fieldset>
            <fieldset className="space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">{t("facts")}</legend>
              {FACT_KEYS.map((k) => {
                const f = profile.facts[k] ?? { value: null, verified: false };
                return (
                  <div key={k} className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
                    <Field label={<span className="flex items-center gap-2">{t(`fact.${k}`)} <Badge tone={f.verified ? "success" : "neutral"}>{f.verified ? t("verified") : t("unverified")}</Badge></span>} htmlFor={`fact-${k}`}>
                      <Input id={`fact-${k}`} name={`fact.${k}`} defaultValue={f.value ?? ""} dir={k === "householdPhraseFa" ? "rtl" : k.endsWith("De") ? "ltr" : undefined} />
                    </Field>
                    <Checkbox name={`fact.${k}.verified`} defaultChecked={f.verified} label={t("verified")} />
                  </div>
                );
              })}
            </fieldset>
            <p className="text-xs text-muted">{t("privateNote")}</p>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("searchTitle")}</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveSearchPreferencesAction} submitLabel={tApp("save")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("maxWarm")} htmlFor="maxWarmRentEur" hint={t("maxWarmHint")}><Input id="maxWarmRentEur" name="maxWarmRentEur" type="number" min={300} defaultValue={prefs.maxWarmRentEur} /></Field>
              <Field label={t("minRooms")} htmlFor="minRooms"><Input id="minRooms" name="minRooms" type="number" step="0.5" min={1} defaultValue={prefs.minRooms} /></Field>
              <Field label={t("minArea")} htmlFor="minAreaSqm"><Input id="minAreaSqm" name="minAreaSqm" type="number" min={10} defaultValue={prefs.minAreaSqm} /></Field>
            </div>
            <Checkbox name="requireEntireApartment" defaultChecked={prefs.requireEntireApartment} label={t("entire")} />
            <Checkbox name="excludeWbs" defaultChecked={prefs.excludeWbs} label={t("noWbs")} />
            <Checkbox name="longTermOnly" defaultChecked={prefs.longTermOnly} label={t("longTerm")} />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
