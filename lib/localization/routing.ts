import { defineRouting } from "next-intl/routing";

export const locales = ["fa", "de"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "fa",
  localePrefix: "always",
});

export const isRtl = (l: string) => l === "fa";
