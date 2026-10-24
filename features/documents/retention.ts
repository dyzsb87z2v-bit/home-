import { and, isNotNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";

/** Today's date in Berlin as YYYY-MM-DD (retention dates are calendar dates). */
export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Deletes documents whose retention date has passed. A document is kept through its
 * retention day and deleted from the following day on. Each deletion is audited.
 */
export async function purgeExpiredDocuments(now = new Date()) {
  const deleted = await getDb()
    .delete(schema.documents)
    .where(and(isNotNull(schema.documents.retentionUntil), lt(schema.documents.retentionUntil, berlinToday(now))))
    .returning({ id: schema.documents.id, userId: schema.documents.userId, type: schema.documents.type, retentionUntil: schema.documents.retentionUntil });
  for (const d of deleted) await audit({ userId: d.userId, actor: "system", action: "document.retention_deleted", target: d.id, details: { type: d.type, retentionUntil: d.retentionUntil } });
  return { deleted: deleted.length };
}
