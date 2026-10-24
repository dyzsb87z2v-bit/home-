import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEur(n: number | null | undefined, locale: string) {
  if (n == null) return null;
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
}

export function formatNum(n: number | null | undefined, locale: string) {
  if (n == null) return null;
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "de-DE", { maximumFractionDigits: 1 }).format(n);
}

export function formatDateTime(d: Date | string | null | undefined, locale: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(d));
}

export function formatDate(d: Date | string | null | undefined, locale: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(new Date(d));
}
