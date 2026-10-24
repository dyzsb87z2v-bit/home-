import { randomBytes } from "node:crypto";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://brh:brh@localhost:5432/brh_test";
process.env.APP_ENV = "testing";
process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.SESSION_SECRET ??= randomBytes(32).toString("base64");
delete process.env.ANTHROPIC_API_KEY; // integration tests never call the real AI
