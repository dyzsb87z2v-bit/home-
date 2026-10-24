import type { schema } from "@/lib/database/client";
import { GmailProvider } from "./gmail";
import { TestEmailProvider } from "./test-provider";
import { EmailProviderError, type EmailProvider } from "./types";

export function providerFor(account: typeof schema.emailAccounts.$inferSelect): EmailProvider {
  if (account.status === "DISCONNECTED") throw new EmailProviderError("AUTH", "email account disconnected");
  if (account.provider === "GMAIL") {
    if (!account.encryptedRefreshToken) throw new EmailProviderError("AUTH", "missing Gmail authorization");
    return new GmailProvider(account.encryptedRefreshToken, account.emailAddress);
  }
  return new TestEmailProvider(account.id, account.emailAddress);
}
