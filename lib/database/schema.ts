import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------- Enums ----------
export const localeEnum = pgEnum("locale", ["fa", "de"]);
export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);
export const triStateEnum = pgEnum("tri_state", ["YES", "NO", "UNKNOWN"]);
export const automationModeEnum = pgEnum("automation_mode", ["DISCOVERY", "DRAFTING", "AUTO_APPLY"]);
export const sourceCategoryEnum = pgEnum("source_category", [
  "PORTAL",
  "PUBLIC_HOUSING",
  "PRIVATE_COMPANY",
  "COOPERATIVE",
  "AGGREGATOR",
  "TEMPORARY_FURNISHED",
  "ALERT_SERVICE",
  "PROPERTY_MANAGER",
]);
export const integrationMethodEnum = pgEnum("integration_method", [
  "OFFICIAL_API",
  "PARTNER_API",
  "FEED",
  "RSS",
  "EMAIL_ALERTS",
  "PUBLIC_RETRIEVAL",
  "MANUAL_IMPORT",
  "BROWSER_ASSISTED",
  "TEST_PROVIDER",
]);
export const operationalStateEnum = pgEnum("operational_state", [
  "CONNECTED",
  "ALERTS_ONLY",
  "PARTIALLY_CONNECTED",
  "MANUAL_ONLY",
  "UNAVAILABLE",
  "DISABLED",
]);
export const submissionCapabilityEnum = pgEnum("submission_capability", [
  "EMAIL",
  "PORTAL_API",
  "PORTAL_FORM_MANUAL",
  "NONE",
  "UNKNOWN",
]);
export const syncStatusEnum = pgEnum("sync_status", ["RUNNING", "SUCCESS", "FAILED", "SKIPPED"]);
export const eligibilityEnum = pgEnum("eligibility", ["ELIGIBLE", "INELIGIBLE", "NEEDS_VERIFICATION"]);
export const propertyTypeEnum = pgEnum("property_type", [
  "APARTMENT",
  "ROOM",
  "SHARED_APARTMENT",
  "HOLIDAY",
  "DORMITORY",
  "HOTEL",
  "OTHER",
  "UNKNOWN",
]);
export const rentalDurationEnum = pgEnum("rental_duration", ["LONG_TERM", "TEMPORARY", "UNKNOWN"]);
export const availabilityEnum = pgEnum("availability", ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]);
export const locationPrecisionEnum = pgEnum("location_precision", ["EXACT", "APPROXIMATE", "UNKNOWN"]);
export const channelEnum = pgEnum("submission_channel", ["EMAIL", "PORTAL_API", "MANUAL", "TEST"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "DRAFT",
  "QUEUED",
  "SENDING",
  "SENT",
  "SUBMITTED_MANUALLY",
  "FAILED",
  "UNCERTAIN",
  "CANCELLED",
]);
export const emailProviderEnum = pgEnum("email_provider", ["GMAIL", "TEST"]);
export const connectionStatusEnum = pgEnum("connection_status", ["CONNECTED", "EXPIRED", "ERROR", "DISCONNECTED"]);
export const directionEnum = pgEnum("direction", ["INBOUND", "OUTBOUND"]);
export const replyCategoryEnum = pgEnum("reply_category", [
  "APPLICATION_RECEIVED",
  "VIEWING_INVITATION",
  "MORE_INFO_REQUESTED",
  "DOCUMENT_REQUEST",
  "REJECTED",
  "APARTMENT_RENTED",
  "ALTERNATIVE_SUGGESTED",
  "FOLLOW_UP_NEEDED",
  "SUSPICIOUS",
  "UNKNOWN",
]);
export const viewingStatusEnum = pgEnum("viewing_status", ["PROPOSED", "ACCEPTED_BY_USER", "DECLINED", "PAST"]);
export const documentTypeEnum = pgEnum("document_type", [
  "PAYSLIP",
  "EMPLOYMENT_CONTRACT",
  "SCHUFA",
  "RENT_DEBT_FREE_CERTIFICATE",
  "TENANT_SELF_DISCLOSURE",
  "IDENTIFICATION",
  "OTHER",
]);
export const logResultEnum = pgEnum("log_result", ["SUCCESS", "FAILURE", "INFO", "WARNING"]);

// ---------- Users & auth ----------
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  locale: localeEnum("locale").notNull().default("fa"),
  theme: themeEnum("theme").notNull().default("system"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- Household & profile ----------
export const households = pgTable("households", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  adults: integer("adults").notNull(),
  children: integer("children").notNull(),
  childAges: jsonb("child_ages").$type<number[]>().notNull().default([]),
  monthlyNetIncomeEur: integer("monthly_net_income_eur"),
  incomeVerified: boolean("income_verified").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type ProfileFact = { value: string | null; verified: boolean };

export const applicantProfiles = pgTable("applicant_profiles", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  /** Free-form facts: employment, employer, contract type, income breakdown, references, pets, viewing availability... */
  facts: jsonb("facts").$type<Record<string, ProfileFact>>().notNull().default({}),
  schufaAvailable: triStateEnum("schufa_available").notNull().default("UNKNOWN"),
  /** Private; never included in generated messages. */
  privateNotes: jsonb("private_notes").$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type AutoApplyAuthorization = {
  authorizedAt: string;
  emailAccountId: string;
  channels: Array<"EMAIL">;
  maxPerDay: number;
  minScore: number;
  onlyEligible: true;
  statement: string;
};

export type NotificationPrefs = Record<string, { inApp: boolean; push: boolean; email: boolean }>;

export const searchPreferences = pgTable("search_preferences", {
  id: id(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  district: text("district").notNull().default("Spandau"),
  maxWarmRentEur: integer("max_warm_rent_eur").notNull().default(1200),
  minRooms: doublePrecision("min_rooms").notNull().default(3),
  minAreaSqm: doublePrecision("min_area_sqm").notNull().default(50),
  requireEntireApartment: boolean("require_entire_apartment").notNull().default(true),
  excludeWbs: boolean("exclude_wbs").notNull().default(true),
  longTermOnly: boolean("long_term_only").notNull().default(true),
  moveIn: text("move_in").notNull().default("ASAP"),
  automationMode: automationModeEnum("automation_mode").notNull().default("DISCOVERY"),
  autoApplyEnabled: boolean("auto_apply_enabled").notNull().default(false),
  autoApplyAuthorization: jsonb("auto_apply_authorization").$type<AutoApplyAuthorization | null>(),
  followUpAfterDays: integer("follow_up_after_days").notNull().default(5),
  maxFollowUps: integer("max_follow_ups").notNull().default(1),
  autoFollowUp: boolean("auto_follow_up").notNull().default(false),
  notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- Sources ----------
export const rentalSources = pgTable("rental_sources", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  category: sourceCategoryEnum("category").notNull(),
  coverage: text("coverage").notNull().default("Berlin"),
  integrationMethods: jsonb("integration_methods").$type<string[]>().notNull().default([]),
  submissionCapability: submissionCapabilityEnum("submission_capability").notNull().default("UNKNOWN"),
  operationalState: operationalStateEnum("operational_state").notNull().default("MANUAL_ONLY"),
  minIntervalMinutes: integer("min_interval_minutes").notNull().default(60),
  existsVerified: boolean("exists_verified"),
  verificationNote: text("verification_note"),
  verifiedAt: ts("verified_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sourceConnections = pgTable(
  "source_connections",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => rentalSources.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    adapter: text("adapter").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    state: operationalStateEnum("state").notNull().default("MANUAL_ONLY"),
    authState: text("auth_state").notNull().default("NOT_REQUIRED"),
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    lastSyncAt: ts("last_sync_at"),
    lastSuccessAt: ts("last_success_at"),
    nextSyncAt: ts("next_sync_at"),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    listingsFound: integer("listings_found").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("source_conn_user_source_adapter").on(t.userId, t.sourceId, t.adapter)],
);

export const sourceSyncJobs = pgTable(
  "source_sync_jobs",
  {
    id: id(),
    connectionId: uuid("connection_id").notNull().references(() => sourceConnections.id, { onDelete: "cascade" }),
    status: syncStatusEnum("status").notNull().default("RUNNING"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    fetched: integer("fetched").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("sync_jobs_conn_idx").on(t.connectionId, t.startedAt)],
);

// ---------- Properties ----------
export const properties = pgTable(
  "properties",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    title: text("title"),
    descriptionDe: text("description_de"),
    descriptionFa: text("description_fa"),
    street: text("street"),
    houseNumber: text("house_number"),
    postalCode: text("postal_code"),
    neighborhood: text("neighborhood"),
    district: text("district"),
    city: text("city"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationPrecision: locationPrecisionEnum("location_precision").notNull().default("UNKNOWN"),
    rooms: doublePrecision("rooms"),
    areaSqm: doublePrecision("area_sqm"),
    coldRentEur: doublePrecision("cold_rent_eur"),
    warmRentEur: doublePrecision("warm_rent_eur"),
    serviceChargesEur: doublePrecision("service_charges_eur"),
    heatingCostsEur: doublePrecision("heating_costs_eur"),
    heatingIncluded: boolean("heating_included"),
    otherCostsEur: doublePrecision("other_costs_eur"),
    depositText: text("deposit_text"),
    furnished: boolean("furnished"),
    kitchen: boolean("kitchen"),
    balcony: boolean("balcony"),
    terrace: boolean("terrace"),
    elevator: boolean("elevator"),
    floor: text("floor"),
    accessible: boolean("accessible"),
    availableFrom: date("available_from"),
    availableFromText: text("available_from_text"),
    rentalDuration: rentalDurationEnum("rental_duration").notNull().default("UNKNOWN"),
    wbsRequired: boolean("wbs_required"),
    cooperativeMembership: text("cooperative_membership"),
    propertyType: propertyTypeEnum("property_type").notNull().default("UNKNOWN"),
    landlordName: text("landlord_name"),
    contactEmail: text("contact_email"),
    contactMethod: text("contact_method"),
    publishedAt: ts("published_at"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastVerifiedAt: ts("last_verified_at"),
    availability: availabilityEnum("availability").notNull().default("UNKNOWN"),
    eligibility: eligibilityEnum("eligibility").notNull().default("NEEDS_VERIFICATION"),
    score: integer("score"),
    saved: boolean("saved").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("properties_user_fingerprint").on(t.userId, t.fingerprint),
    index("properties_user_elig_idx").on(t.userId, t.eligibility, t.score),
    index("properties_user_seen_idx").on(t.userId, t.firstSeenAt),
  ],
);

export const propertySourceLinks = pgTable(
  "property_source_links",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => rentalSources.id),
    sourceListingId: text("source_listing_id"),
    url: text("url"),
    canonicalUrl: text("canonical_url"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("psl_user_source_listing").on(t.userId, t.sourceId, t.sourceListingId),
    uniqueIndex("psl_user_canonical_url").on(t.userId, t.canonicalUrl),
    index("psl_property_idx").on(t.propertyId),
  ],
);

export const propertyPhotos = pgTable(
  "property_photos",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull().default(0),
    sourceId: uuid("source_id").references(() => rentalSources.id),
  },
  (t) => [uniqueIndex("photos_property_url").on(t.propertyId, t.url)],
);

export type EvaluationReason = { code: string; params?: Record<string, string | number> };

export const propertyEvaluations = pgTable(
  "property_evaluations",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    eligibility: eligibilityEnum("eligibility").notNull(),
    reasons: jsonb("reasons").$type<EvaluationReason[]>().notNull(),
    score: integer("score"),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>(),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
    evaluatedAt: ts("evaluated_at").notNull().defaultNow(),
  },
  (t) => [index("evaluations_property_idx").on(t.propertyId, t.evaluatedAt)],
);

// ---------- Email ----------
export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: emailProviderEnum("provider").notNull(),
    emailAddress: text("email_address").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: connectionStatusEnum("status").notNull().default("CONNECTED"),
    lastSyncAt: ts("last_sync_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("email_accounts_user_addr").on(t.userId, t.provider, t.emailAddress)],
);

// ---------- Applications ----------
export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    recipient: text("recipient").notNull(),
    recipientNormalized: text("recipient_normalized").notNull(),
    emailAccountId: uuid("email_account_id").references(() => emailAccounts.id),
    status: applicationStatusEnum("status").notNull().default("DRAFT"),
    subject: text("subject").notNull(),
    bodyDe: text("body_de").notNull(),
    bodyFa: text("body_fa"),
    generatedBy: text("generated_by").notNull().default("TEMPLATE"),
    validation: jsonb("validation").$type<{ ok: boolean; issues: string[] }>(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    providerMessageId: text("provider_message_id"),
    providerThreadId: text("provider_thread_id"),
    submittedContent: jsonb("submitted_content").$type<Record<string, unknown>>(),
    submittedAt: ts("submitted_at"),
    lastError: text("last_error"),
    autoSubmitted: boolean("auto_submitted").notNull().default(false),
    followUpCount: integer("follow_up_count").notNull().default(0),
    lastFollowUpAt: ts("last_follow_up_at"),
    closed: boolean("closed").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Never two applications for the same property and recipient.
    uniqueIndex("applications_property_recipient").on(t.userId, t.propertyId, t.recipientNormalized),
    index("applications_user_status_idx").on(t.userId, t.status),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: id(),
    applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("app_events_app_idx").on(t.applicationId, t.at)],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: id(),
    applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    bodyDe: text("body_de").notNull(),
    bodyFa: text("body_fa"),
    status: applicationStatusEnum("status").notNull().default("DRAFT"),
    providerMessageId: text("provider_message_id"),
    sentAt: ts("sent_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("follow_ups_app_seq").on(t.applicationId, t.sequence)],
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: id(),
    accountId: uuid("account_id").notNull().references(() => emailAccounts.id, { onDelete: "cascade" }),
    providerThreadId: text("provider_thread_id").notNull(),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    subject: text("subject"),
    lastMessageAt: ts("last_message_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_threads_account_thread").on(t.accountId, t.providerThreadId)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    threadId: uuid("thread_id").notNull().references(() => emailThreads.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    direction: directionEnum("direction").notNull(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyFa: text("body_fa"),
    isListingAlert: boolean("is_listing_alert").notNull().default(false),
    receivedAt: ts("received_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_messages_thread_msg").on(t.threadId, t.providerMessageId)],
);

export const landlordReplies = pgTable("landlord_replies", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().unique().references(() => emailMessages.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  category: replyCategoryEnum("category").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  summaryFa: text("summary_fa"),
  suggestedAction: text("suggested_action"),
  suspicious: boolean("suspicious").notNull().default(false),
  suspiciousReasons: jsonb("suspicious_reasons").$type<string[]>().notNull().default([]),
  classifiedBy: text("classified_by").notNull(),
  handled: boolean("handled").notNull().default(false),
  createdAt: createdAt(),
});

export const viewingAppointments = pgTable("viewing_appointments", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  replyId: uuid("reply_id").unique().references(() => landlordReplies.id, { onDelete: "cascade" }),
  proposedAt: ts("proposed_at"),
  proposedText: text("proposed_text"),
  location: text("location"),
  status: viewingStatusEnum("status").notNull().default("PROPOSED"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- Documents ----------
export const documents = pgTable("documents", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: documentTypeEnum("type").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  /** AES-256-GCM: iv(12) | tag(16) | ciphertext */
  encryptedData: bytea("encrypted_data").notNull(),
  retentionUntil: date("retention_until"),
  createdAt: createdAt(),
});

// ---------- Notifications ----------
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, string | number | null>>().notNull().default({}),
    link: text("link"),
    deliveredChannels: jsonb("delivered_channels").$type<string[]>().notNull().default([]),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notifications_user_dedupe").on(t.userId, t.dedupeKey), index("notif_user_idx").on(t.userId, t.createdAt)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

// ---------- Automation & logs ----------
export const automationRules = pgTable(
  "automation_rules",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("automation_rules_user_type").on(t.userId, t.type)],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    result: logResultEnum("result").notNull(),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => rentalSources.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("activity_user_at_idx").on(t.userId, t.at)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    ip: text("ip"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_user_at_idx").on(t.userId, t.at)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicroUsd: integer("cost_micro_usd").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("ai_usage_at_idx").on(t.at)],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: ts("updated_at").notNull().default(sql`now()`),
});
