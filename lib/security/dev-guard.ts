/** Development/testing helpers must never be reachable in production. */
export function devToolsAllowed() {
  return process.env.APP_ENV !== "production" && process.env.ENABLE_DEV_TOOLS === "1";
}
