import { getTranslations } from "next-intl/server";
import { PropertyList } from "@/components/apartment/property-list";
import { PageHeader } from "@/components/ui/empty";
import { requireUser } from "@/lib/auth";
import { listProperties } from "@/lib/data/properties";

export default async function SavedPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const rows = await listProperties(user.id, { saved: true, sort: "score", limit: 100 });
  return (
    <div>
      <PageHeader title={t("apartments.savedTitle")} />
      <PropertyList rows={rows} empty={t("apartments.savedEmpty")} page={1} hasMore={false} baseQuery={{}} />
    </div>
  );
}
