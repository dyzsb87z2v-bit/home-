"use client";

import { LogOut, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, usePathname } from "@/lib/localization/navigation";
import { cn } from "@/lib/utils";
import { LanguageSwitch } from "./language-switch";
import { NAV } from "./nav-items";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children, unread, logoutAction }: { children: React.ReactNode; unread: number; logoutAction: () => Promise<void> }) {
  const t = useTranslations("nav");
  const ta = useTranslations("app");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navList = (onNavigate?: () => void) => (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-primary/10 font-medium text-primary" : "text-fg/80 hover:bg-surface-2",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{t(item.key)}</span>
              {item.key === "notifications" && unread > 0 ? (
                <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{unread}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">
        {ta("skipToContent")}
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        <div className="px-5 py-5">
          <div className="text-[15px] font-semibold">{ta("name")}</div>
          <div className="text-xs text-muted">{ta("tagline")}</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3" aria-label={t("menu")}>
          {navList()}
        </nav>
        <div className="space-y-2 border-t border-border p-3">
          <LanguageSwitch />
          <form action={logoutAction}>
            <button className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-2">
              <LogOut className="h-4 w-4" aria-hidden /> {t("logout")}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface/90 px-4 py-2 backdrop-blur lg:hidden" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{ta("name")}</div>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitch compact />
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => setOpen(true)} aria-label={t("menu")}>
              <Menu className="h-5 w-5" />
              {unread > 0 ? <span className="sr-only">{unread}</span> : null}
            </button>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden" aria-label={t("menu")}>
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => n.mobile).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-primary" : "text-muted")}>
                    <item.icon className="h-5 w-5" aria-hidden />
                    <span className="max-w-full truncate px-1">{t(item.key)}</span>
                  </Link>
                </li>
              );
            })}
            <li>
              <button onClick={() => setOpen(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
                <Menu className="h-5 w-5" aria-hidden />
                <span>{ta("more")}</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="fade-in absolute inset-y-0 end-0 flex w-80 max-w-[85vw] flex-col bg-surface shadow-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">{t("menu")}</span>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => setOpen(false)} aria-label={ta("cancel")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3">{navList(() => setOpen(false))}</nav>
            <form action={logoutAction} className="safe-bottom border-t border-border p-3">
              <button className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-2">
                <LogOut className="h-4 w-4" aria-hidden /> {t("logout")}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
