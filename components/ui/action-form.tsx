"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ActionResult } from "@/app/actions/types";
import { Link } from "@/lib/localization/navigation";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** Form bound to a server action returning ActionResult; shows translated success/error feedback. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  variant,
  successText,
  hidden,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  className?: string;
  variant?: ButtonProps["variant"];
  successText?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const t = useTranslations();
  const errorText = (r: ActionResult) => {
    if (r.code && t.has(`applications.blockCodes.${r.code}`)) return t(`applications.blockCodes.${r.code}`);
    if (r.code && t.has(`applications.status.${r.code}`)) return `${t(`applications.status.${r.code}`)}${r.message ? ` — ${r.message}` : ""}`;
    return r.message ?? t("app.errorGeneric");
  };
  return (
    <form action={formAction} className={cn("space-y-4", className)}>
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} variant={variant}>
          {pending ? t("app.loading") : submitLabel}
        </Button>
        {state ? (
          <p role="status" className={cn("flex items-center gap-1.5 text-sm", state.ok ? "text-success" : "text-danger")}>
            {state.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
            {state.ok ? (successText ?? t("app.saved")) : errorText(state)}
          </p>
        ) : null}
        {state?.ok && typeof state.data?.href === "string" ? (
          <Link href={state.data.href} className="text-sm text-primary underline">
            {t("app.open")} →
          </Link>
        ) : null}
      </div>
    </form>
  );
}
