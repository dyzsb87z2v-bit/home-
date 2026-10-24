import { PgBoss } from "pg-boss";

export const Q = {
  tick: "tick",
  sourceSync: "source-sync",
  emailPoll: "email-poll",
  emailSync: "email-sync",
  processProperty: "process-property",
  followUpScan: "follow-up-scan",
  listingExpiry: "listing-expiry",
  health: "health",
  deadLetter: "dead-letter",
} as const;

export type QueueName = (typeof Q)[keyof typeof Q];

let starting: Promise<PgBoss> | null = null;

/**
 * Durable Postgres-backed queue (survives restarts; no user device needs to be online).
 * Only the worker process runs cron scheduling and maintenance; the web process just enqueues.
 */
export function getBoss(role: "worker" | "client" = "client"): Promise<PgBoss> {
  if (!starting) {
    starting = (async () => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is not set");
      const worker = role === "worker";
      const b = new PgBoss({ connectionString: url, schema: "pgboss", schedule: worker, supervise: worker, max: worker ? 10 : 3 });
      b.on("error", (e: unknown) => console.error(JSON.stringify({ level: "error", msg: "pg-boss error", err: String(e) })));
      await b.start();
      await b.createQueue(Q.deadLetter, {});
      const common = { retryLimit: 3, retryDelay: 60, retryBackoff: true, retryDelayMax: 3600, deadLetter: Q.deadLetter, expireInSeconds: 900 };
      await b.createQueue(Q.tick, { policy: "singleton", retryLimit: 0 });
      await b.createQueue(Q.sourceSync, { ...common, policy: "stately" });
      await b.createQueue(Q.emailPoll, { policy: "singleton", retryLimit: 0 });
      await b.createQueue(Q.emailSync, { ...common, policy: "stately" });
      // Submissions are never retried automatically (duplicate risk) → retryLimit 0.
      await b.createQueue(Q.processProperty, { policy: "stately", retryLimit: 0, deadLetter: Q.deadLetter, expireInSeconds: 600 });
      await b.createQueue(Q.followUpScan, { policy: "singleton", retryLimit: 0 });
      await b.createQueue(Q.listingExpiry, { policy: "singleton", retryLimit: 1 });
      await b.createQueue(Q.health, { policy: "singleton", retryLimit: 0 });
      return b;
    })().catch((e) => {
      starting = null;
      throw e;
    });
  }
  return starting;
}

/** Enqueue; with a singletonKey, a duplicate job for the same key is not created (stately/singleton policies). */
export async function enqueue(name: QueueName, data: object, singletonKey?: string) {
  const b = await getBoss();
  return b.send(name, data, singletonKey ? { singletonKey } : {});
}
