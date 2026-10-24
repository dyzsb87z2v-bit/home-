import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentUser().catch(() => null)) redirect(`/${locale}`);
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <LoginForm locale={locale} />
        </div>
        <LanguageSwitchPublic />
      </div>
    </main>
  );
}

function LanguageSwitchPublic() {
  return (
    <div className="flex justify-center gap-4 text-sm">
      <a href="/fa/login" lang="fa">فارسی</a>
      <span className="text-muted">|</span>
      <a href="/de/login" lang="de">Deutsch</a>
    </div>
  );
}

