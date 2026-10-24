import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://brh:brh@localhost:5432/brh_test";
  const env = { ...process.env, DATABASE_URL: url, APP_ENV: "testing" };
  // fresh schema for every run
  execSync(`psql "${url}" -q -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;"`, { stdio: "inherit", env });
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env });
}
