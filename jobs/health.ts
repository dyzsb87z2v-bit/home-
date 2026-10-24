/** Worker heartbeat is written every 5 minutes; older than 15 minutes means monitoring is not running. */
export function isHeartbeatFresh(at: string | null | undefined, maxAgeMs = 15 * 60_000, now = Date.now()) {
  return !!at && now - new Date(at).getTime() < maxAgeMs;
}
