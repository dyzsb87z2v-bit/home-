"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Field label={t("email")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required dir="ltr" /></Field>
      <Field label={t("password")} htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" /></Field>
      {state && !state.ok ? <p role="alert" className="text-sm text-danger">{state.code === "rateLimited" ? t("rateLimited") : t("invalid")}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{t("submit")}</Button>
    </form>
  );
}
