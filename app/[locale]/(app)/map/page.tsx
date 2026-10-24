import { and, count, eq, isNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { SpandauMap } from "@/components/apartment/spandau-map";
import { PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { listProperties } from "@/lib/data/properties";
import { formatEur } from "@/lib/utils";

export default async function MapPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const rows = await listProperties(user.id, { withCoordinates: true, eligibility: ["ELIGIBLE", "NEEDS_VERIFICATION"], limit: 500 });
  const [{ n }] = (await getDb()
    .select({ n: count() })
    .from(schema.properties)
    .where(and(eq(schema.properties.userId, user.id), isNull(schema.properties.latitude), eq(schema.properties.hidden, false)))) as [{ n: number }];
  const points = rows.map(({ p }) => ({
    id: p.id,
    lat: p.latitude!,
    lng: p.longitude!,
    title: p.title ?? "",
    price: p.warmRentEur != null ? `${formatEur(p.warmRentEur, "de")} warm` : "Warmmiete ?",
    href: `/${locale}/apartments/${p.id}`,
    eligibility: p.eligibility,
    approximate: p.locationPrecision !== "EXACT",
  }));
  return (
    <div className="space-y-3">
      <PageHeader title={t("map.title")} />
      <SpandauMap points={points} boundaryLabel={t("map.boundary")} attribution={t("map.attribution")} />
      {n > 0 ? <p className="text-sm text-muted">{t("map.noCoordinates", { count: n })}</p> : null}
    </div>
  );
}
