import { getTranslations } from "next-intl/server";
import { PropertyList } from "@/components/apartment/property-list";
import { PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { listProperties } from "@/lib/data/properties";

const PAGE = 20;

export default async function ApartmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const t = await getTranslations();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [rows, verify] = await Promise.all([
    listProperties(user.id, { eligibility: ["ELIGIBLE"], sort: "score", limit: PAGE + 1, offset: (page - 1) * PAGE }),
    page === 1 ? listProperties(user.id, { eligibility: ["NEEDS_VERIFICATION"], sort: "score", limit: 10 }) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-8">
      <section>
        <PageHeader title={t("apartments.title")} subtitle={t("apartments.subtitle")} />
        <PropertyList rows={rows.slice(0, PAGE)} empty={t("apartments.empty")} page={page} hasMore={rows.length > PAGE} baseQuery={{}} />
      </section>
      {verify.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("apartments.needsVerificationTitle")}</h2>
          <PropertyList rows={verify} empty="" page={1} hasMore={false} baseQuery={{}} />
        </section>
      ) : null}
    </div>
  );
}
