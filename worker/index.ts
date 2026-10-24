/**
 * Background worker — runs continuously in the cloud, independent of the user's devices.
 * Start with `npm run worker` (one or more instances; pg-boss coordinates them safely).
 */
import { closeDb } from "@/lib/database/client";
import { log } from "@/lib/logging";
import * as h from "@/jobs/handlers";
import { getBoss, Q } from "@/jobs/queue";

async function main() {
  const boss = await getBoss("worker");
  const wrap =
    <T,>(name: string, fn: (data: T) => Promise<unknown>) =>
    async (jobs: Array<{ id: string; data: T }>) => {
      for (const job of jobs) {
        const t0 = Date.now();
        try {
          const r = await fn(job.data);
          log("info", "job done", { queue: name, jobId: job.id, ms: Date.now() - t0, result: r as Record<string, unknown> });
        } catch (e) {
          log("error", "job failed", { queue: name, jobId: job.id, err: String((e as Error).message ?? e) });
          throw e; // let pg-boss apply retry/backoff/dead-letter
        }
      }
    };

  await boss.work(Q.tick, wrap(Q.tick, h.handleTick));
  await boss.work(Q.sourceSync, { localConcurrency: 3 }, wrap(Q.sourceSync, h.handleSourceSync));
  await boss.work(Q.emailPoll, wrap(Q.emailPoll, h.handleEmailPoll));
  await boss.work(Q.emailSync, { localConcurrency: 2 }, wrap(Q.emailSync, h.handleEmailSync));
  await boss.work(Q.processProperty, wrap(Q.processProperty, h.handleProcessProperty));
  await boss.work(Q.followUpScan, wrap(Q.followUpScan, h.handleFollowUpScan));
  await boss.work(Q.listingExpiry, wrap(Q.listingExpiry, h.handleListingExpiry));
  await boss.work(Q.health, wrap(Q.health, h.handleHealth));
  await boss.work(Q.deadLetter, async (jobs: Array<{ id: string; data: unknown }>) => {
    for (const j of jobs) await h.handleDeadLetter(j);
  });

  const tz = { tz: "Europe/Berlin" };
  await boss.schedule(Q.tick, "* * * * *", {}, tz);
  await boss.schedule(Q.emailPoll, "*/5 * * * *", {}, tz);
  await boss.schedule(Q.health, "*/5 * * * *", {}, tz);
  await boss.schedule(Q.followUpScan, "17 * * * *", {}, tz);
  await boss.schedule(Q.listingExpiry, "30 3 * * *", {}, tz);
  await h.handleHealth();
  log("info", "worker started", { queues: Object.values(Q) });

  const shutdown = async (sig: string) => {
    log("info", "worker stopping", { sig });
    await boss.stop({ graceful: true, timeout: 30_000 });
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  log("error", "worker crashed", { err: String(e) });
  process.exit(1);
});
