"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/preferences";
import { usePathname, useRouter } from "@/lib/localization/navigation";
import { cn } from "@/lib/utils";

/** فارسی | Deutsch — switches immediately and stores the preference on the account (all devices). */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const choose = (next: "fa" | "de") => {
    if (next === locale) return;
    start(async () => {
      await setLocaleAction(next).catch(() => undefined);
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <div role="group" aria-label="Language / زبان" className={cn("inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm", pending && "opacity-60", !compact && "w-full")}>
      {(["fa", "de"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => choose(l)}
          aria-pressed={locale === l}
          className={cn("min-h-9 flex-1 rounded-md px-3 font-medium", locale === l ? "bg-surface shadow-sm" : "text-muted")}
        >
          {l === "fa" ? "فارسی" : "Deutsch"}
        </button>
      ))}
    </div>
  );
}
