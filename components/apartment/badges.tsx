import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

export async function EligibilityBadge({ value }: { value: "ELIGIBLE" | "INELIGIBLE" | "NEEDS_VERIFICATION" }) {
  const t = await getTranslations("eligibility");
  const tone = value === "ELIGIBLE" ? "success" : value === "INELIGIBLE" ? "danger" : "warning";
  return <Badge tone={tone}>{t(value)}</Badge>;
}

export async function ReasonText({ code, params }: { code: string; params?: Record<string, string | number> }) {
  const t = await getTranslations("eligibility.reason");
  if (!t.has(code)) return <>{code}</>;
  return <>{t(code, Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, typeof v === "number" ? v.toLocaleString("de-DE") : v])))}</>;
}
