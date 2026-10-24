import { AdapterError } from "./types";

/**
 * Polite HTTP for permitted sources: identifies itself, honours robots.txt, enforces a
 * per-host minimum delay, never retries aggressively, never rotates IPs or evades protections.
 */

const robotsCache = new Map<string, { at: number; rules: Array<{ allow: boolean; path: string }> }>();
const lastHit = new Map<string, number>();
const MIN_HOST_DELAY_MS = 10_000;

export function userAgent() {
  return process.env.FETCH_USER_AGENT || "BerlinRentHunterAI/0.1 (personal apartment search; respects robots.txt)";
}

export function parseRobots(txt: string, agent = "berlinrenthunterai"): Array<{ allow: boolean; path: string }> {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let cur: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "disallow" && val) cur.rules.push({ allow: false, path: val });
      if (key === "allow" && val) cur.rules.push({ allow: true, path: val });
    }
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  return (specific ?? groups.find((g) => g.agents.includes("*")))?.rules ?? [];
}

export function robotsAllows(rules: Array<{ allow: boolean; path: string }>, path: string): boolean {
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const pattern = "^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp(pattern).test(path) && (!best || r.path.length > best.len)) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

async function robotsFor(origin: string, signal?: AbortSignal) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.rules;
  let rules: Array<{ allow: boolean; path: string }> = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": userAgent() }, signal });
    if (res.status === 401 || res.status === 403) rules = [{ allow: false, path: "/" }];
    else if (res.ok) rules = parseRobots(await res.text());
  } catch {
    // network failure: be conservative
    throw new AdapterError("HTTP_ERROR", `robots.txt unreachable for ${origin}`, true);
  }
  robotsCache.set(origin, { at: Date.now(), rules });
  return rules;
}

export async function politeFetch(url: string, opts: { signal?: AbortSignal; accept?: string } = {}): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new AdapterError("CONFIG_INVALID", "Only https URLs are allowed");
  const rules = await robotsFor(u.origin, opts.signal);
  if (!robotsAllows(rules, u.pathname + u.search)) throw new AdapterError("ROBOTS_DISALLOWED", `robots.txt disallows ${u.pathname}`);

  const wait = (lastHit.get(u.host) ?? 0) + MIN_HOST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(url, { headers: { "user-agent": userAgent(), accept: opts.accept ?? "*/*" }, signal: ctrl.signal, redirect: "follow" });
    if (res.status === 429) throw new AdapterError("RATE_LIMITED", "Source rate limit (429)", true);
    if (res.status === 403) throw new AdapterError("HTTP_ERROR", "Access denied by source (403) — not retried", false);
    if (!res.ok) throw new AdapterError("HTTP_ERROR", `HTTP ${res.status}`, res.status >= 500);
    return res;
  } catch (e) {
    if (e instanceof AdapterError) throw e;
    if ((e as Error).name === "AbortError") throw new AdapterError("TIMEOUT", "Request timed out", true);
    throw new AdapterError("HTTP_ERROR", String((e as Error).message ?? e), true);
  } finally {
    clearTimeout(timer);
  }
}
