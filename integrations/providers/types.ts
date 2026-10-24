import type { NormalizedListing } from "@/features/listings/types";

export type AdapterId = "feed" | "email-alerts" | "manual" | "test";

export interface SyncContext {
  userId: string;
  sourceSlug: string;
  config: Record<string, unknown>;
  lastSuccessAt: Date | null;
  signal?: AbortSignal;
}

export interface SyncResult {
  listings: NormalizedListing[];
  /** source listing IDs reported as removed/unavailable */
  removedIds?: string[];
  /** human-readable notes shown in diagnostics */
  notes?: string[];
}

export interface SourceAdapter {
  id: AdapterId;
  /** polling adapters run on schedule; event adapters are fed by other jobs (email) or the user */
  kind: "polling" | "event";
  /** validates config, throws a user-facing error code string on problems */
  validateConfig(config: Record<string, unknown>): void;
  sync?(ctx: SyncContext): Promise<SyncResult>;
}

export class AdapterError extends Error {
  constructor(
    public code: "ROBOTS_DISALLOWED" | "HTTP_ERROR" | "RATE_LIMITED" | "PARSE_ERROR" | "CONFIG_INVALID" | "NOT_ALLOWED_IN_PRODUCTION" | "TIMEOUT",
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
