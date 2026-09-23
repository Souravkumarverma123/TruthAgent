// The outside-world boundary: every call to OpenAI or Redis goes through here.
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
