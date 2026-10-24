import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-base sm:text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-10";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-32", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium", className)} {...props} />;
}

export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-10 cursor-pointer items-start gap-3 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: React.ReactNode; htmlFor: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
