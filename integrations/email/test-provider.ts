import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/lib/database/client";
import type { EmailProvider, InboundMessage, OutboundMessage, SendResult } from "./types";
import { EmailProviderError } from "./types";

/**
 * Simulated mailbox for DEVELOPMENT/TESTING (end-to-end tests). Nothing leaves the system.
 * Refuses to operate in production.
 */
type Box = { sent: Array<OutboundMessage & { id: string; threadId: string; at: string }>; inbox: Array<Omit<InboundMessage, "receivedAt"> & { receivedAt: string }> };

const key = (accountId: string) => `test-mailbox:${accountId}`;

function guard() {
  if (process.env.APP_ENV === "production") throw new EmailProviderError("NOT_ALLOWED", "test mailbox disabled in production");
}

export async function readBox(accountId: string): Promise<Box> {
  const [row] = await getDb().select().from(schema.systemSettings).where(eq(schema.systemSettings.key, key(accountId)));
  return (row?.value as Box) ?? { sent: [], inbox: [] };
}

async function writeBox(accountId: string, box: Box) {
  await getDb()
    .insert(schema.systemSettings)
    .values({ key: key(accountId), value: box })
    .onConflictDoUpdate({ target: schema.systemSettings.key, set: { value: box, updatedAt: new Date() } });
}

/** Test helper: deliver a simulated inbound email (e.g. a landlord reply). */
export async function deliverTestInbound(accountId: string, m: Omit<InboundMessage, "providerMessageId" | "receivedAt" | "messageIdHeader"> & { receivedAt?: Date }) {
  guard();
  const box = await readBox(accountId);
  const id = `test-in-${randomUUID()}`;
  box.inbox.push({ ...m, providerMessageId: id, messageIdHeader: `<${id}@test.invalid>`, receivedAt: (m.receivedAt ?? new Date()).toISOString() });
  await writeBox(accountId, box);
  return id;
}

export class TestEmailProvider implements EmailProvider {
  constructor(
    private accountId: string,
    public address: string,
  ) {}

  async send(m: OutboundMessage): Promise<SendResult> {
    guard();
    if (m.to.endsWith("@fail.invalid")) throw new EmailProviderError("HTTP", "simulated permanent failure");
    if (m.to.endsWith("@timeout.invalid")) throw new EmailProviderError("TIMEOUT", "simulated timeout");
    const box = await readBox(this.accountId);
    const id = `test-out-${randomUUID()}`;
    const threadId = m.threadId ?? `test-thread-${randomUUID()}`;
    box.sent.push({ ...m, id, threadId, at: new Date().toISOString() });
    await writeBox(this.accountId, box);
    return { providerMessageId: id, providerThreadId: threadId };
  }

  async listMessageIds(): Promise<Array<{ id: string; threadId: string }>> {
    guard();
    return (await readBox(this.accountId)).inbox.map((m) => ({ id: m.providerMessageId, threadId: m.providerThreadId }));
  }

  async getMessage(id: string): Promise<InboundMessage> {
    guard();
    const m = (await readBox(this.accountId)).inbox.find((x) => x.providerMessageId === id);
    if (!m) throw new EmailProviderError("HTTP", "not found");
    return { ...m, receivedAt: new Date(m.receivedAt) };
  }
}
