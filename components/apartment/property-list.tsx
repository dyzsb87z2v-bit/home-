import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty";
import { Link } from "@/lib/localization/navigation";
import type { listProperties } from "@/lib/data/properties";
import { PropertyCard } from "./property-card";

export async function PropertyList({ rows, empty, page, hasMore, baseQuery }: { rows: Awaited<ReturnType<typeof listProperties>>; empty: string; page: number; hasMore: boolean; baseQuery: Record<string, string> }) {
  const t = await getTranslations("app");
  if (!rows.length && page === 1) return <EmptyState icon={Search} title={empty} />;
  const q = (p: number) => `?${new URLSearchParams({ ...baseQuery, page: String(p) })}`;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <PropertyCard key={r.p.id} {...r} />
      ))}
      <div className="flex justify-between pt-2 text-sm">
        {page > 1 ? <Link className="text-primary" href={q(page - 1)}>← {t("back")}</Link> : <span />}
        {hasMore ? <Link className="text-primary" href={q(page + 1)}>{t("more")} →</Link> : null}
      </div>
    </div>
  );
}
