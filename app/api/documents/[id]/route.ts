import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser, clientIp } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import { decryptBuffer } from "@/lib/security/crypto";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [doc] = await getDb().select().from(schema.documents).where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id)));
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await audit({ userId: user.id, actor: "user", action: "document.viewed", target: id, ip: await clientIp() });
  const body = decryptBuffer(doc.encryptedData);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": doc.mimeType,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; object-src 'self'",
    },
  });
}
