import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/** Creates a fresh, isolated e2e user for every run. */
export default function globalSetup() {
  const email = `e2e-${Date.now()}@test.invalid`;
  const password = "e2e-password-123456";
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
  execSync("npx tsx scripts/create-user.ts", { stdio: "inherit", env: { ...process.env, BRH_EMAIL: email, BRH_PASSWORD: password, BRH_NAME: "Milad Masoudi" } });
  writeFileSync("tests/e2e/.user.json", JSON.stringify({ email, password }));
}
