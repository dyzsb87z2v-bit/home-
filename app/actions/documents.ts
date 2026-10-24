"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import { encryptBuffer } from "@/lib/security/crypto";
import type { ActionResult } from "./types";

const MAX = 10 * 1024 * 1024;
const ALLOWED: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

const Schema = z.object({
  type: z.enum(["PAYSLIP", "EMPLOYMENT_CONTRACT", "SCHUFA", "RENT_DEBT_FREE_CERTIFICATE", "TENANT_SELF_DISCLOSURE", "IDENTIFICATION", "OTHER"]),
  retentionUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
});

export async function uploadDocumentAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = Schema.safeParse({ type: form.get("type"), retentionUntil: form.get("retentionUntil") ?? "" });
  const file = form.get("file");
  if (!p.success || !(file instanceof File) || file.size === 0) return { ok: false, code: "invalid" };
  if (file.size > MAX) return { ok: false, code: "too_large" };
  const buf = Buffer.from(await file.arrayBuffer());
  // Verify content by magic bytes, not by the client-supplied MIME type
  const mime = Object.entries(ALLOWED).find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  if (!mime) return { ok: false, code: "unsupported_type" };
  const [doc] = await getDb()
    .insert(schema.documents)
    .values({ userId: user.id, type: p.data.type, filename: file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120), mimeType: mime, sizeBytes: buf.length, encryptedData: encryptBuffer(buf), retentionUntil: p.data.retentionUntil || null })
    .returning({ id: schema.documents.id });
  await audit({ userId: user.id, actor: "user", action: "document.uploaded", target: doc!.id, details: { type: p.data.type, size: buf.length } });
  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteDocumentAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("documentId"));
  const res = await getDb().delete(schema.documents).where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id))).returning({ id: schema.documents.id });
  if (res.length) await audit({ userId: user.id, actor: "user", action: "document.deleted", target: id });
  revalidatePath("/documents");
}
