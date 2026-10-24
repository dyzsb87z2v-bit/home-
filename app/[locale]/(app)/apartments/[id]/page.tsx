import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Bookmark, BookmarkCheck, ExternalLink, EyeOff, ImageOff, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { hideAction, toggleSavedAction, confirmFactsAction, translateDescriptionAction } from "@/app/actions/listings";
import { createDraftAction } from "@/app/actions/applications";
import { ApplicationPanel } from "@/components/applications/application-panel";
import { EligibilityBadge, ReasonText } from "@/components/apartment/badges";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { formatDate, formatDateTime, formatEur, formatNum } from "@/lib/utils";
import { affordabilityTier } from "@/features/matching/scoring";
import { aiConfigured } from "@/integrations/ai/claude";

export default async function PropertyPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const db = getDb();
  const [p] = await db.select().from(schema.properties).where(and(eq(schema.properties.id, id), eq(schema.properties.userId, user.id)));
  if (!p) notFound();

  const [photos, links, evals, apps] = await Promise.all([
    db.select().from(schema.propertyPhotos).where(eq(schema.propertyPhotos.propertyId, id)).orderBy(asc(schema.propertyPhotos.position)),
    db
      .select({ l: schema.propertySourceLinks, s: schema.rentalSources })
      .from(schema.propertySourceLinks)
      .innerJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.propertySourceLinks.sourceId))
      .where(eq(schema.propertySourceLinks.propertyId, id)),
    db.select().from(schema.propertyEvaluations).where(eq(schema.propertyEvaluations.propertyId, id)).orderBy(desc(schema.propertyEvaluations.evaluatedAt)).limit(1),
    db.select().from(schema.applications).where(and(eq(schema.applications.propertyId, id), eq(schema.applications.userId, user.id))).orderBy(desc(schema.applications.createdAt)),
  ]);
  const evaluation = evals[0];
  const appIds = apps.map((a) => a.id);
  const [events, replies, followUps, viewings] = appIds.length
    ? await Promise.all([
        db.select().from(schema.applicationEvents).where(inArray(schema.applicationEvents.applicationId, appIds)).orderBy(asc(schema.applicationEvents.at)),
        db
          .select({ r: schema.landlordReplies, m: schema.emailMessages })
          .from(schema.landlordReplies)
          .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.landlordReplies.messageId))
          .where(inArray(schema.landlordReplies.applicationId, appIds))
          .orderBy(asc(schema.emailMessages.receivedAt)),
        db.select().from(schema.followUps).where(inArray(schema.followUps.applicationId, appIds)).orderBy(asc(schema.followUps.sequence)),
        db.select().from(schema.viewingAppointments).where(inArray(schema.viewingAppointments.applicationId, appIds)),
      ])
    : [[], [], [], []];

  const eur = (n: number | null) => (n != null ? formatEur(n, locale) : null);
  const unknown = <span className="text-muted">{t("app.unknown")}</span>;
  const yesNo = (b: boolean | null) => (b == null ? unknown : b ? t("app.yes") : t("app.no"));
  const tier = affordabilityTier(p.warmRentEur);
  const address = [p.street, p.houseNumber].filter(Boolean).join(" ");

  const facts: Array<[string, React.ReactNode]> = [
    [t("listing.warm"), eur(p.warmRentEur) ?? unknown],
    [t("listing.cold"), eur(p.coldRentEur) ?? unknown],
    [t("listing.serviceCharges"), eur(p.serviceChargesEur) ?? unknown],
    [t("listing.heating"), p.heatingIncluded ? t("listing.heatingIncluded") : (eur(p.heatingCostsEur) ?? unknown)],
    [t("listing.otherCosts"), eur(p.otherCostsEur) ?? unknown],
    [t("listing.deposit"), p.depositText ? <span className="ltr-text" lang="de">{p.depositText}</span> : unknown],
    [t("listing.rooms"), p.rooms != null ? formatNum(p.rooms, locale) : unknown],
    [t("listing.area"), p.areaSqm != null ? t("listing.areaValue", { area: formatNum(p.areaSqm, locale)! }) : unknown],
    [t("listing.availableFrom"), p.availableFrom ? formatDate(p.availableFrom, locale) : p.availableFromText ? <span className="ltr-text" lang="de">{p.availableFromText}</span> : unknown],
    [t("listing.duration"), t(`listing.duration${p.rentalDuration}`)],
    [t("listing.type"), t(`listing.type${p.propertyType}`)],
    [t("listing.wbs"), p.wbsRequired == null ? unknown : p.wbsRequired ? t("listing.wbsRequired") : t("listing.wbsNotRequired")],
    [t("listing.furnished"), yesNo(p.furnished)],
    [t("listing.kitchen"), yesNo(p.kitchen)],
    [t("listing.balcony"), yesNo(p.balcony)],
    [t("listing.terrace"), yesNo(p.terrace)],
    [t("listing.elevator"), yesNo(p.elevator)],
    [t("listing.floor"), p.floor ?? unknown],
    [t("listing.accessible"), yesNo(p.accessible)],
    [t("listing.cooperative"), p.cooperativeMembership ? <span className="ltr-text" lang="de">{p.cooperativeMembership}</span> : unknown],
    [t("listing.landlord"), p.landlordName ?? unknown],
    [t("listing.contact"), p.contactEmail ? <span className="ltr-text">{p.contactEmail}</span> : (p.contactMethod ?? unknown)],
    [t("listing.availability"), t(`listing.availability${p.availability}`)],
    [t("listing.published"), formatDateTime(p.publishedAt, locale) ?? unknown],
    [t("listing.firstSeen"), formatDateTime(p.firstSeenAt, locale)],
    [t("listing.lastVerified"), formatDateTime(p.lastVerifiedAt, locale) ?? unknown],
  ];

  const breakdown = (evaluation?.scoreBreakdown ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <EligibilityBadge value={p.eligibility} />
            {p.score != null ? <Badge tone="primary">{t("listing.score")} {formatNum(p.score, locale)}</Badge> : null}
            {tier !== "UNKNOWN" ? <Badge>{t(`eligibility.tier.${tier}`)}</Badge> : null}
            {p.isSample ? <Badge tone="warning">{t("app.sample")}</Badge> : null}
          </div>
          <h1 className="ltr-text text-xl font-semibold sm:text-2xl" lang="de">{p.title ?? t("app.unknown")}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            {address || p.postalCode ? (
              <span className="ltr-text">{[address, [p.postalCode, "Berlin"].filter(Boolean).join(" "), p.neighborhood].filter(Boolean).join(", ")}</span>
            ) : (
              t("listing.addressUnknown")
            )}
            {p.locationPrecision === "APPROXIMATE" ? <Badge>{t("listing.approximateLocation")}</Badge> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={toggleSavedAction}>
            <input type="hidden" name="propertyId" value={p.id} />
            <Button variant="outline" size="sm">
              {p.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />} {p.saved ? t("listing.unsave") : t("listing.save")}
            </Button>
          </form>
          <form action={hideAction}>
            <input type="hidden" name="propertyId" value={p.id} />
            <Button variant="ghost" size="sm">
              <EyeOff className="h-4 w-4" /> {t("listing.hide")}
            </Button>
          </form>
        </div>
      </div>

      {/* Photos: only real photos from the listing source, never stock images */}
      {photos.length ? (
        <div>
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-xl" tabIndex={0} aria-label={t("listing.photosFromSource")}>
            {photos.map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={ph.id} src={ph.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-56 w-auto max-w-[85vw] shrink-0 snap-start rounded-xl object-cover sm:h-72" />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("listing.photosFromSource")}</p>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted">
          <ImageOff className="h-5 w-5" aria-hidden /> {t("listing.noPhotos")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("eligibility.analysis")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-sm">
                {(evaluation?.reasons ?? []).map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className={r.code.endsWith("_OK") ? "text-success" : r.code.endsWith("UNKNOWN") ? "text-warning" : "text-danger"}>
                      {r.code.endsWith("_OK") ? "✓" : r.code.endsWith("UNKNOWN") ? "?" : "✕"}
                    </span>
                    <ReasonText code={r.code} params={r.params} />
                  </li>
                ))}
              </ul>
              {Object.keys(breakdown).length ? <p className="text-xs text-muted">{t("eligibility.scoreBreakdown", Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, String(v)])))}</p> : null}
            </CardContent>
          </Card>

          {p.eligibility === "NEEDS_VERIFICATION" ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("eligibility.verifyTitle")}</CardTitle>
                  <p className="mt-1 text-sm text-muted">{t("eligibility.verifyHint")}</p>
                </div>
              </CardHeader>
              <CardContent>
                <ActionForm action={confirmFactsAction} submitLabel={t("eligibility.verifySubmit")} hidden={{ propertyId: p.id }}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {p.warmRentEur == null ? <Field label={t("listing.warm")} htmlFor="warmRentEur"><Input id="warmRentEur" name="warmRentEur" inputMode="decimal" /></Field> : null}
                    {p.rooms == null ? <Field label={t("listing.rooms")} htmlFor="rooms"><Input id="rooms" name="rooms" inputMode="decimal" /></Field> : null}
                    {p.areaSqm == null ? <Field label={t("listing.area")} htmlFor="areaSqm"><Input id="areaSqm" name="areaSqm" inputMode="decimal" /></Field> : null}
                    {!p.postalCode ? <Field label={t("listing.postalCode")} htmlFor="postalCode"><Input id="postalCode" name="postalCode" inputMode="numeric" pattern="\d{5}" /></Field> : null}
                    {p.wbsRequired == null ? (
                      <Field label={t("listing.wbs")} htmlFor="wbsRequired">
                        <Select id="wbsRequired" name="wbsRequired" defaultValue="">
                          <option value="">—</option>
                          <option value="false">{t("listing.wbsNotRequired")}</option>
                          <option value="true">{t("listing.wbsRequired")}</option>
                        </Select>
                      </Field>
                    ) : null}
                    {p.rentalDuration === "UNKNOWN" ? (
                      <Field label={t("listing.duration")} htmlFor="rentalDuration">
                        <Select id="rentalDuration" name="rentalDuration" defaultValue="">
                          <option value="">—</option>
                          <option value="LONG_TERM">{t("listing.durationLONG_TERM")}</option>
                          <option value="TEMPORARY">{t("listing.durationTEMPORARY")}</option>
                        </Select>
                      </Field>
                    ) : null}
                    {p.propertyType === "UNKNOWN" ? (
                      <Field label={t("listing.type")} htmlFor="propertyType">
                        <Select id="propertyType" name="propertyType" defaultValue="">
                          <option value="">—</option>
                          {(["APARTMENT", "ROOM", "SHARED_APARTMENT", "HOLIDAY", "DORMITORY", "HOTEL", "OTHER"] as const).map((x) => (
                            <option key={x} value={x}>{t(`listing.type${x}`)}</option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                    {!p.contactEmail ? <Field label={t("listing.contact")} htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" dir="ltr" /></Field> : null}
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("applications.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {apps.length ? (
                apps.map((a) => (
                  <ApplicationPanel
                    key={a.id}
                    app={a}
                    events={events.filter((e) => e.applicationId === a.id)}
                    replies={replies.filter((r) => r.r.applicationId === a.id)}
                    followUps={followUps.filter((f) => f.applicationId === a.id)}
                    viewings={viewings.filter((v) => v.applicationId === a.id)}
                    listingUrl={links[0]?.l.url ?? null}
                  />
                ))
              ) : p.eligibility === "INELIGIBLE" ? (
                <p className="text-sm text-muted">{t("applications.blockCodes.NOT_ELIGIBLE")}</p>
              ) : (
                <ActionForm action={createDraftAction} submitLabel={t("applications.createDraft")} hidden={{ propertyId: p.id }} successText={t("applications.draft")} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("listing.descriptionDe")}</CardTitle>
            </CardHeader>
            <CardContent>
              {p.descriptionDe ? <p className="ltr-text whitespace-pre-line text-sm leading-relaxed" lang="de">{p.descriptionDe}</p> : <p className="text-sm text-muted">{t("listing.noDescription")}</p>}
            </CardContent>
          </Card>

          {p.descriptionDe ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("listing.descriptionFa")}</CardTitle>
              </CardHeader>
              <CardContent>
                {p.descriptionFa ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed" lang="fa" dir="rtl">{p.descriptionFa}</p>
                ) : aiConfigured() ? (
                  <ActionForm action={translateDescriptionAction} submitLabel={t("listing.translate")} hidden={{ propertyId: p.id }} variant="outline" />
                ) : (
                  <p className="text-sm text-muted">{t("listing.translationUnavailable")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("listing.sources")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {links.map(({ l, s }) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <span>{s.name}</span>
                  {l.url && /^https?:\/\//.test(l.url) ? (
                    <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary underline">
                      {t("listing.originalListing")} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 sm:pt-5">
              <dl className="divide-y divide-border text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-end font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
