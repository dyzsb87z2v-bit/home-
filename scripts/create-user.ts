/**
 * Creates the login account (no public sign-up).
 * Usage: BRH_EMAIL=you@example.com BRH_PASSWORD='…' BRH_NAME='Milad Masoudi' npm run user:create
 */
import bcrypt from "bcryptjs";
import { getDb, schema, closeDb } from "@/lib/database/client";
import { setupUser } from "@/features/users/setup";

const email = process.env.BRH_EMAIL?.trim().toLowerCase();
const password = process.env.BRH_PASSWORD;
const name = process.env.BRH_NAME ?? "Milad Masoudi";
if (!email || !password || password.length < 12) {
  console.error("BRH_EMAIL and BRH_PASSWORD (≥12 chars) are required");
  process.exit(1);
}
const db = getDb();
const [u] = await db
  .insert(schema.users)
  .values({ email, passwordHash: await bcrypt.hash(password, 12), locale: "fa" })
  .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash: await bcrypt.hash(password, 12) } })
  .returning();
await setupUser(db, u!.id, { fullName: name, contactEmail: email });
console.log(`user ready: ${email}`);
await closeDb();
