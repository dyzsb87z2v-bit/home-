import { getTranslations } from "next-intl/server";
import { PropertyList } from "@/components/apartment/property-list";
import { PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { listProperties } from "@/lib/data/properties";
import { Link } from "@/lib/localization/navigation";
import { cn } from "@/lib/utils";

const PAGE = 20;
type E = "ELIGIBLE" | "INELIGIBLE" | "NEEDS_VERIFICATION";

export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations();
  const e = (["ELIGIBLE", "INELIGIBLE", "NEEDS_VERIFICATION"] as const).includes(sp.e as E) ? (sp.e as E) : null;
  const sort = sp.sort === "score" || sp.sort === "price" ? sp.sort : "newest";
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listProperties(user.id, { eligibility: e ? [e] : undefined, sort, limit: PAGE + 1, offset: (page - 1) * PAGE });
  const chip = (label: string, params: Record<string, string>, active: boolean) => (
    <Link key={label} href={`?${new URLSearchParams(params)}`} className={cn("rounded-full border px-3 py-1.5 text-sm", active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-surface-2")}>
      {label}
    </Link>
  );
  const base = { ...(e ? { e } : {}), sort };
  return (
    <div>
      <PageHeader title={t("feed.title")} subtitle={t("feed.subtitle")} />
      <div className="mb-4 flex flex-wrap gap-2" role="toolbar" aria-label={t("feed.filterEligibility")}>
        {chip(t("app.all"), { sort }, !e)}
        {(["ELIGIBLE", "NEEDS_VERIFICATION", "INELIGIBLE"] as const).map((x) => chip(t(`eligibility.${x}`), { e: x, sort }, e === x))}
        <span className="mx-1 hidden w-px bg-border sm:block" />
        {(["newest", "score", "price"] as const).map((s) => chip(t(`feed.sort${s[0]!.toUpperCase()}${s.slice(1)}`), { ...(e ? { e } : {}), sort: s }, sort === s))}
      </div>
      <PropertyList rows={rows.slice(0, PAGE)} empty={t("feed.empty")} page={page} hasMore={rows.length > PAGE} baseQuery={base} />
    </div>
  );
}
