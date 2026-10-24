import { decryptString } from "@/lib/security/crypto";
import type { EmailProvider, InboundMessage, OutboundMessage, SendResult } from "./types";
import { EmailProviderError } from "./types";

/**
 * Gmail via OAuth 2.0 (REST, no password storage).
 * Scopes: gmail.send (send applications) + gmail.readonly (read replies and alert emails).
 */
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/email/google/callback`;
}

export function buildAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string; scopes: string[] }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as { refresh_token?: string; access_token?: string; scope?: string; error?: string };
  if (!res.ok || !j.access_token || !j.refresh_token) throw new EmailProviderError("AUTH", j.error ?? "token exchange failed");
  return { refreshToken: j.refresh_token, accessToken: j.access_token, scopes: (j.scope ?? "").split(" ") };
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; error?: string };
  if (j.error === "invalid_grant") throw new EmailProviderError("EXPIRED", "Gmail authorization expired or revoked");
  if (!res.ok || !j.access_token) throw new EmailProviderError("AUTH", j.error ?? "refresh failed");
  return j.access_token;
}

export async function gmailProfile(accessToken: string): Promise<string> {
  const res = await fetch(`${API}/profile`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new EmailProviderError("AUTH", `profile HTTP ${res.status}`);
  const j = (await res.json()) as { emailAddress: string };
  return j.emailAddress;
}

function encodeHeader(v: string) {
  // RFC 2047 for non-ASCII subjects/names
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function sanitizeHeader(v: string) {
  return v.replace(/[\r\n]+/g, " ").trim();
}

export function buildMime(from: string, m: OutboundMessage): string {
  const headers = [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(m.to)}`,
    `Subject: ${encodeHeader(sanitizeHeader(m.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    `X-BRH-Idempotency-Key: ${sanitizeHeader(m.idempotencyKey)}`,
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeader(m.inReplyTo)}`, `References: ${sanitizeHeader(m.inReplyTo)}`);
  const body = Buffer.from(m.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: Array<{ name: string; value: string }> };

function decodeB64Url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function collect(part: GmailPart, out: { text: string[]; html: string[] }) {
  if (part.mimeType === "text/plain" && part.body?.data) out.text.push(decodeB64Url(part.body.data));
  else if (part.mimeType === "text/html" && part.body?.data) out.html.push(decodeB64Url(part.body.data));
  for (const p of part.parts ?? []) collect(p, out);
}

export function parseGmailMessage(j: { id: string; threadId: string; internalDate?: string; payload?: GmailPart }): InboundMessage {
  const headers = Object.fromEntries((j.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const out = { text: [] as string[], html: [] as string[] };
  if (j.payload) collect(j.payload, out);
  return {
    providerMessageId: j.id,
    providerThreadId: j.threadId,
    messageIdHeader: headers["message-id"] ?? null,
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    text: out.text.join("\n") || null,
    html: out.html.join("\n") || null,
    receivedAt: j.internalDate ? new Date(Number(j.internalDate)) : new Date(),
  };
}

export class GmailProvider implements EmailProvider {
  private token: string | null = null;
  constructor(
    private encryptedRefreshToken: string,
    public address: string,
  ) {}

  private async auth() {
    if (!this.token) this.token = await accessTokenFromRefresh(decryptString(this.encryptedRefreshToken));
    return this.token;
  }

  private async call(path: string, init: RequestInit = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await this.auth()}`, "content-type": "application/json" } });
      if (res.status === 401) throw new EmailProviderError("EXPIRED", "Gmail token rejected");
      if (res.status === 429) throw new EmailProviderError("RATE_LIMITED", "Gmail rate limit");
      if (!res.ok) throw new EmailProviderError("HTTP", `Gmail HTTP ${res.status}`);
      return res.json();
    } catch (e) {
      if (e instanceof EmailProviderError) throw e;
      if ((e as Error).name === "AbortError") throw new EmailProviderError("TIMEOUT", "Gmail request timed out");
      throw new EmailProviderError("NETWORK", String(e));
    } finally {
      clearTimeout(t);
    }
  }

  async send(m: OutboundMessage): Promise<SendResult> {
    const raw = Buffer.from(buildMime(this.address, m), "utf8").toString("base64url");
    const j = (await this.call("/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(m.threadId ? { threadId: m.threadId } : {}) }) })) as { id: string; threadId: string; labelIds?: string[] };
    if (!j.id) throw new EmailProviderError("UNCERTAIN", "Gmail returned no message id");
    return { providerMessageId: j.id, providerThreadId: j.threadId };
  }

  async listMessageIds(query: string, max = 50): Promise<Array<{ id: string; threadId: string }>> {
    const j = (await this.call(`/messages?${new URLSearchParams({ q: query, maxResults: String(max) })}`)) as { messages?: Array<{ id: string; threadId: string }> };
    return j.messages ?? [];
  }

  async getMessage(id: string): Promise<InboundMessage> {
    return parseGmailMessage(await this.call(`/messages/${encodeURIComponent(id)}?format=full`));
  }
}
