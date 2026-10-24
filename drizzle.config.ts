import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://brh:brh@localhost:5432/berlin_rent_hunter" },
});
