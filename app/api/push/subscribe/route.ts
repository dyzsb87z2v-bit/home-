import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";

const Sub = z.object({ endpoint: z.string().url().startsWith("https://"), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Sub.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await getDb()
    .insert(schema.pushSubscriptions)
    .values({ userId: user.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: user.id, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth } });
  return NextResponse.json({ ok: true });
}
