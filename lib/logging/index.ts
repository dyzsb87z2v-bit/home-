import { getDb, schema } from "@/lib/database/client";

type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEYS = /token|secret|password|authorization|cookie|key/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v == null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(x, depth + 1)]));
}

/** Structured JSON logs on stdout (collected by the hosting platform). Secrets are redacted. */
export function log(level: Level, msg: string, ctx: Record<string, unknown> = {}) {
  if (level === "debug" && process.env.APP_ENV === "production") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(ctx) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type ActivityInput = {
  userId: string | null;
  action: string;
  result: "SUCCESS" | "FAILURE" | "INFO" | "WARNING";
  propertyId?: string | null;
  sourceId?: string | null;
  applicationId?: string | null;
  details?: Record<string, unknown>;
  error?: string | null;
};

/** Agent Activity timeline — only real system events are recorded here. */
export async function recordActivity(a: ActivityInput) {
  try {
    await getDb().insert(schema.activityLogs).values({
      userId: a.userId,
      action: a.action,
      result: a.result,
      propertyId: a.propertyId ?? null,
      sourceId: a.sourceId ?? null,
      applicationId: a.applicationId ?? null,
      details: (redact(a.details ?? {}) as Record<string, unknown>),
      error: a.error ?? null,
    });
  } catch (e) {
    log("error", "activity log write failed", { action: a.action, err: String(e) });
  }
}

/** Security-relevant audit trail (logins, authorizations, document access, sends). */
export async function audit(a: { userId: string | null; actor: string; action: string; target?: string; ip?: string | null; details?: Record<string, unknown> }) {
  await getDb().insert(schema.auditLogs).values({
    userId: a.userId,
    actor: a.actor,
    action: a.action,
    target: a.target ?? null,
    ip: a.ip ?? null,
    details: (redact(a.details ?? {}) as Record<string, unknown>),
  });
}
