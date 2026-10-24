export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}

export interface SendResult {
  providerMessageId: string;
  providerThreadId: string | null;
}

export interface InboundMessage {
  providerMessageId: string;
  providerThreadId: string;
  messageIdHeader: string | null;
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: Date;
}

export interface EmailProvider {
  address: string;
  send(m: OutboundMessage): Promise<SendResult>;
  listMessageIds(query: string, max?: number): Promise<Array<{ id: string; threadId: string }>>;
  getMessage(id: string): Promise<InboundMessage>;
}

export class EmailProviderError extends Error {
  constructor(
    /** UNCERTAIN/TIMEOUT/NETWORK during send = the message may or may not have gone out. */
    public code: "AUTH" | "EXPIRED" | "RATE_LIMITED" | "HTTP" | "TIMEOUT" | "NETWORK" | "UNCERTAIN" | "NOT_ALLOWED",
    message: string,
  ) {
    super(message);
  }
}
