// The outside-world boundary: every call to OpenAI, Redis or a web page goes through here.
// Two modes, per AGENTS.md: `live` (real calls, costs money) and `replay`
// (canned data, $0, no network). Replay is the default in dev and tests.
import { Redis } from "@upstash/redis";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import type { Result } from "./schemas.ts";

export function outsideWorldMode(): "live" | "replay" {
  return process.env.OUTSIDE_WORLD_MODE === "live" ? "live" : "replay";
}

let openaiClient: OpenAI | undefined;
function client(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI();
  return openaiClient;
}

/**
 * Runs one OpenAI call through the boundary. In replay mode, `fixture` is
 * returned with no network call and no cost; in live mode, `live` runs
 * against the real API.
 *
 * ponytail: replay mode returns a fixed fixture regardless of the request,
 * not a request-hash-keyed recording. A real Check's Understand/Verdict
 * calls are input-independent enough for this tracer bullet's one scenario;
 * upgrade to hash-keyed fixtures (docs/architecture.md §7) when a later
 * ticket needs more than one replay scenario.
 */
export async function callOpenAI<T>(params: { fixture: T; live: (client: OpenAI) => Promise<T> }): Promise<T> {
  if (outsideWorldMode() === "replay") return params.fixture;
  return params.live(client());
}

/** Only public websites: `url` is chosen by the model, so no IP literals,
 * localhost or internal hostnames.
 * ponytail: doesn't resolve DNS, so a public name pointing at a private IP
 * still passes; resolve and check the address if this ever runs next to
 * something sensitive. */
function isPublicHttpUrl(url: URL): boolean {
  const host = url.hostname;
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    host.includes(".") &&
    !host.startsWith("[") &&
    !/^[\d.]+$/.test(host) &&
    !/(^|\.)(localhost|local|internal)$/i.test(host)
  );
}

/** Wayback's capture index for one page, earliest capture first (CDX lists
 * oldest first, so `limit=1` is the earliest copy). */
export function waybackCdxUrl(pageUrl: string): string {
  return `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(pageUrl)}&output=json&limit=1&fl=timestamp`;
}

const MAX_REDIRECTS = 3;

/**
 * Fetches a web page (or Wayback API) as text. In replay mode, `fixture` is
 * the recorded body for this exact URL; no recording means the fetch fails,
 * just like an unreachable page would live.
 */
export async function fetchText(url: string, params: { signal: AbortSignal; fixture: string | undefined }): Promise<string> {
  if (outsideWorldMode() === "replay") {
    if (params.fixture === undefined) throw new Error(`No replay recording for ${url}`);
    return params.fixture;
  }
  // Redirects are followed by hand so every hop gets the public-URL check.
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpUrl(current)) throw new Error("Not a public web page");
    const response = await fetch(current, {
      signal: params.signal,
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TruthAgent/0.1)" },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
  throw new Error("Too many redirects");
}

const RESULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, per docs/architecture.md §6

let redisClient: Redis | undefined;
function redis(): Redis {
  if (!redisClient) redisClient = Redis.fromEnv();
  return redisClient;
}

// ponytail: replay mode keeps Results as JSON files under .data/results
// instead of real Redis, so dev and tests need no Upstash credentials and
// cost $0. A plain in-memory Map isn't enough here — Next.js's dev server
// runs route handlers and Server Components in separate module graphs, so
// a module-level Map saved by the Check endpoint isn't the same Map the
// proof page reads. A file survives that. No TTL/expiry in replay mode;
// live mode (real Redis, 30-day TTL) is what deploys to Vercel.
const REPLAY_RESULTS_DIR = join(process.cwd(), ".data", "results");

async function replayResultPath(id: string): Promise<string> {
  await mkdir(REPLAY_RESULTS_DIR, { recursive: true });
  return join(REPLAY_RESULTS_DIR, `${id}.json`);
}

export async function saveResult(result: Result): Promise<void> {
  if (outsideWorldMode() === "replay") {
    await writeFile(await replayResultPath(result.id), JSON.stringify(result));
    return;
  }
  await redis().set(`result:${result.id}`, result, { ex: RESULT_TTL_SECONDS });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getResult(id: string): Promise<Result | null> {
  if (outsideWorldMode() === "replay") {
    // `id` comes straight from the proof page's URL, and becomes a file
    // path below — reject anything that isn't the crypto.randomUUID()
    // shape saveResult() produces, so a path like "../../etc/passwd" can't
    // escape .data/results.
    if (!UUID_RE.test(id)) return null;
    try {
      return JSON.parse(await readFile(await replayResultPath(id), "utf-8"));
    } catch {
      return null;
    }
  }
  const stored = await redis().get<Result>(`result:${id}`);
  return stored ?? null;
}
