import { BedDouble, ImageOff, Ruler } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { schema } from "@/lib/database/client";
import { Link } from "@/lib/localization/navigation";
import { formatEur, formatNum } from "@/lib/utils";
import { affordabilityTier } from "@/features/matching/scoring";
import { EligibilityBadge, ReasonText } from "./badges";

type Property = typeof schema.properties.$inferSelect;
type Reason = { code: string; params?: Record<string, string | number> };

export async function PropertyCard({ p, photo, reason, sourceName }: { p: Property; photo?: string | null; reason?: Reason | null; sourceName?: string | null }) {
  const locale = await getLocale();
  const t = await getTranslations();
  const tier = affordabilityTier(p.warmRentEur);
  const address = [p.street, p.houseNumber].filter(Boolean).join(" ");
  return (
    <Card className="fade-in overflow-hidden">
      <Link href={`/apartments/${p.id}`} className="flex flex-col gap-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex-row">
        <div className="relative aspect-[16/10] w-full shrink-0 bg-surface-2 sm:aspect-auto sm:h-auto sm:w-48">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1 text-xs text-muted">
              <ImageOff className="h-5 w-5" aria-hidden />
              {t("listing.noPhotos")}
            </div>
          )}
          {p.isSample ? <Badge tone="warning" className="absolute start-2 top-2">{t("app.sample")}</Badge> : null}
        </div>
        <div className="min-w-0 flex-1 space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <EligibilityBadge value={p.eligibility} />
            {p.score != null ? <Badge tone="primary">{t("listing.score")} {formatNum(p.score, locale)}</Badge> : null}
            {tier !== "UNKNOWN" && tier !== "OVER_BUDGET" ? <Badge>{t(`eligibility.tier.${tier}`)}</Badge> : null}
            {p.availability === "UNAVAILABLE" ? <Badge tone="danger">{t("listing.availabilityUNAVAILABLE")}</Badge> : null}
          </div>
          <h3 className="ltr-text line-clamp-2 font-medium" lang="de">{p.title ?? t("app.unknown")}</h3>
          <p className="text-sm text-muted">
            {address ? <span className="ltr-text">{address}{p.postalCode ? `, ${p.postalCode}` : ""}</span> : p.postalCode ? <span className="ltr-text">{p.postalCode} {p.neighborhood ?? ""}</span> : t("listing.addressUnknown")}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">
              {p.warmRentEur != null ? `${formatEur(p.warmRentEur, locale)} ${t("listing.warm")}` : `${t("listing.warm")}: ${t("app.unknown")}`}
            </span>
            <span className="inline-flex items-center gap-1 text-muted">
              <BedDouble className="h-4 w-4" aria-hidden /> {p.rooms != null ? t("listing.roomsValue", { rooms: formatNum(p.rooms, locale)! }) : "—"}
            </span>
            <span className="inline-flex items-center gap-1 text-muted">
              <Ruler className="h-4 w-4" aria-hidden /> {p.areaSqm != null ? t("listing.areaValue", { area: formatNum(p.areaSqm, locale)! }) : "—"}
            </span>
          </div>
          {reason ? (
            <p className="text-xs text-muted">
              <ReasonText code={reason.code} params={reason.params} />
            </p>
          ) : null}
          {sourceName ? <p className="text-xs text-muted">{t("listing.source")}: {sourceName}</p> : null}
        </div>
      </Link>
    </Card>
  );
}
