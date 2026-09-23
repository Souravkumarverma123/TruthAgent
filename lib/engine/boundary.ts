// The outside-world boundary: every call to OpenAI, SerpApi, Sightengine, Redis or a web page goes through a World.
// Two adapters, per AGENTS.md: `liveWorld` (real calls, costs money) and `replayWorld(scenario)`
// (whole answers from a Scenario, $0, no network). Replay is the default in dev and tests.
import { Redis } from "@upstash/redis";
import { lookup as dnsLookup } from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { join } from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import type { MODELS } from "./models.ts";
import type { AgentTurn, ImageMatch, OriginsOutput, Result, Understood, VerdictOutput } from "./schemas.ts";

export function outsideWorldMode(): "live" | "replay" {
  return process.env.OUTSIDE_WORLD_MODE === "live" ? "live" : "replay";
}

/** Which OpenAI step is asking. Replay answers by this; live ignores it. */
export type Ask =
  | { step: "understand" }
  | { step: "agentTurn"; turn: number }
  | { step: "origins" }
  | { step: "verdict"; model: keyof typeof MODELS; run: number };

interface Answers {
  understand: Understood;
  agentTurn: AgentTurn;
  origins: OriginsOutput;
  verdict: VerdictOutput;
}

/** Everything outside the Engine. A Check is given one (check.ts). */
export interface World {
  /** One OpenAI call: `live` builds and sends the request; replay answers `ask` instead. */
  openai<A extends Ask>(ask: A, live: (client: OpenAI) => Promise<Answers[A["step"]]>): Promise<Answers[A["step"]]>;
  /** A web page (or Wayback API) as text; an HTTP error status throws `HTTP <status>`. */
  fetchText(url: string, signal: AbortSignal): Promise<string>;
  /** Pages carrying this exact photo, best match first (SerpApi Google Lens). No dates: those come from reading the pages. */
  reverseImage(image: Uint8Array, signal: AbortSignal): Promise<ImageMatch[]>;
  /** Sightengine's 0–1 "AI-generated" score; null when no Sightengine key is set. */
  aiGenerated(image: Uint8Array, signal: AbortSignal): Promise<number | null>;
  saveResult(result: Result): Promise<void>;
  getResult(id: string): Promise<Result | null>;
}

/**
 * Whole answers from the outside world for one Check, per step. A request it doesn't cover
 * throws a `ReplayGap`: no recording, no answer.
 *
 * ponytail: whole answers picked by step, not recordings keyed by request hash. Upgrade to
 * hash-keyed recordings (docs/architecture.md §7) when writing Scenarios by hand stops scaling.
 */
export interface Scenario {
  understand?: Understood;
  agentTurns?: AgentTurn[];
  /** url → body, or an HTTP error status. Wayback lookups are urls too (`waybackCdxUrl`). */
  pages?: Record<string, string | number>;
  origins?: OriginsOutput;
  /** Reverse image search on the Message's photo. */
  reverseImage?: ImageMatch[];
  aiGenerated?: number | null;
  verdicts?: { luna?: [VerdictOutput, VerdictOutput]; sol?: VerdictOutput };
}

/** A replay request the Scenario has no answer for: a broken test, never a failed outside call,
 * so code that tolerates outside failures (a page that won't load) rethrows it. */
export class ReplayGap extends Error {
  constructor(what: string) {
    super(`Replay has no answer for ${what}. Add it to the Scenario (lib/engine/scenarios.ts), or run live.`);
  }
}

/** Where the Engine tolerates an outside failure (a page that won't load, tagging that fails):
 * the fallback for that failure, while a ReplayGap still fails the Check. */
export function tolerate<T>(fallback: (error: unknown) => T): (error: unknown) => T {
  return (error) => {
    if (error instanceof ReplayGap) throw error;
    return fallback(error);
  };
}

function replayAnswer(scenario: Scenario, ask: Ask): { answer: unknown; what: string } {
  switch (ask.step) {
    case "understand":
      return { answer: scenario.understand, what: "understand" };
    case "agentTurn":
      return { answer: scenario.agentTurns?.[ask.turn], what: `agent turn ${ask.turn}` };
    case "origins":
      return { answer: scenario.origins, what: "origins" };
    case "verdict":
      return ask.model === "sol"
        ? { answer: scenario.verdicts?.sol, what: "verdict (sol)" }
        : { answer: scenario.verdicts?.luna?.[ask.run], what: `verdict (luna run ${ask.run})` };
  }
}

type ResultStore = Pick<World, "saveResult" | "getResult">;

/** Results in memory, per world: tests leave nothing behind, and no Check reads another's Results. */
function memoryResults(): ResultStore {
  const saved = new Map<string, Result>();
  return {
    saveResult: async (result) => void saved.set(result.id, result),
    getResult: async (id) => saved.get(id) ?? null,
  };
}

export function replayWorld(scenario: Scenario, results: ResultStore = memoryResults()): World {
  return {
    async openai<A extends Ask>(ask: A) {
      const { answer, what } = replayAnswer(scenario, ask);
      if (answer === undefined) throw new ReplayGap(what);
      return answer as Answers[A["step"]];
    },
    async fetchText(url) {
      const page = scenario.pages?.[url];
      if (page === undefined) throw new ReplayGap(url);
      if (typeof page === "number") throw new Error(`HTTP ${page}`);
      return page;
    },
    async reverseImage() {
      if (scenario.reverseImage === undefined) throw new ReplayGap("reverse image search");
      return scenario.reverseImage;
    },
    async aiGenerated() {
      if (scenario.aiGenerated === undefined) throw new ReplayGap("the AI-generated score");
      return scenario.aiGenerated;
    },
    ...results,
  };
}

let openaiClient: OpenAI | undefined;
function client(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI();
  return openaiClient;
}

/** Only public websites: `url` is chosen by the model, so no IP literals,
 * localhost or internal hostnames. The address the connection actually uses
 * is checked too, in `publicOnlyLookup`. */
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

function isPublicIPv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this host, private, loopback, multicast and up
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && (b === 0 || b === 168)) return false; // protocol assignments, private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

function isPublicIPv6(address: string): boolean {
  const plain = address.split("%")[0].toLowerCase();
  if (plain.startsWith("::ffff:")) {
    const mapped = plain.slice("::ffff:".length);
    return isIP(mapped) === 4 && isPublicIPv4(mapped);
  }
  if (plain === "::" || plain === "::1") return false;
  return !/^(f[cd]|fe[89ab])/.test(plain); // unique-local, link-local
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIPv4(address);
  if (version === 6) return isPublicIPv6(address);
  return false;
}

/** Checks the resolved address, not just the hostname, so a public name that
 * resolves to a private one (DNS rebinding) can't reach an internal service.
 * It runs as the connection's own lookup, so the address checked is the
 * address connected to. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, options, (error, address, family) => {
    if (error) {
      callback(error, address as string, family);
      return;
    }
    const addresses = Array.isArray(address) ? address : [{ address: address as string, family }];
    if (addresses.some((entry) => !isPublicAddress(entry.address))) {
      callback(new Error("Not a public web page"), "", 0);
      return;
    }
    callback(null, address as string, family);
  });
};

/** Wayback's capture index for one page, earliest capture first (CDX lists
 * oldest first, so `limit=1` is the earliest copy). */
export function waybackCdxUrl(pageUrl: string): string {
  return `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(pageUrl)}&output=json&limit=1&fl=timestamp`;
}

const MAX_REDIRECTS = 3;
/** The model picks the url, so a page is read up to this size and no further;
 * far more than `read_page` keeps, and bounded memory for a huge body. */
const MAX_PAGE_CHARS = 1_000_000;
const USER_AGENT = "Mozilla/5.0 (compatible; TruthAgent/0.1)";

interface PageResponse {
  status: number;
  location: string | null;
  body: string;
}

/** One hop. `node:http(s)` rather than `fetch` for two reasons: a connection
 * `lookup` that vets the resolved address, and a body read that stops at
 * `MAX_PAGE_CHARS` instead of buffering whatever the site sends. */
function requestPage(url: URL, signal: AbortSignal): Promise<PageResponse> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<PageResponse>((resolve, reject) => {
    const request = send(
      url,
      { signal, lookup: publicOnlyLookup, headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" } },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location ?? null;
        if (status >= 300 && status < 400 && location) {
          response.destroy();
          resolve({ status, location, body: "" });
          return;
        }
        response.setEncoding("utf-8");
        let body = "";
        response.on("data", (chunk: string) => {
          body += chunk;
          if (body.length >= MAX_PAGE_CHARS) {
            body = body.slice(0, MAX_PAGE_CHARS);
            response.destroy();
          }
        });
        response.on("end", () => resolve({ status, location, body }));
        response.on("close", () => resolve({ status, location, body }));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** A web page (or Wayback API) as text, from the real web. */
async function fetchLive(url: string, signal: AbortSignal): Promise<string> {
  // Redirects are followed by hand so every hop gets the public-URL check.
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpUrl(current)) throw new Error("Not a public web page");
    const response = await requestPage(current, signal);
    if (response.status >= 300 && response.status < 400 && response.location) {
      current = new URL(response.location, current);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return response.body;
  }
  throw new Error("Too many redirects");
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !body.error) throw new Error(`HTTP ${response.status}`);
  return body;
}

/** SerpApi's Image API takes at most 500 KB. Re-encoding also drops the file's EXIF, so the
 * phone's GPS never leaves our server. */
async function forSerpApi(image: Uint8Array): Promise<Blob> {
  const jpeg = await sharp(image).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
}

/** An uploaded photo has no public URL, so it goes up to SerpApi's Image API first (the id lasts
 * 10 minutes), then Google Lens `exact_matches` searches by that id. */
async function reverseImageLive(image: Uint8Array, signal: AbortSignal): Promise<ImageMatch[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY is not set");
  const form = new FormData();
  form.append("image", await forSerpApi(image), "photo.jpg");
  form.append("api_key", key);
  const upload = await json(await fetch("https://serpapi.com/image", { method: "POST", body: form, signal }));
  if (typeof upload.image_id !== "string") throw new Error(String(upload.error ?? "SerpApi upload failed"));

  const params = new URLSearchParams({ engine: "google_lens", type: "exact_matches", image_id: upload.image_id, api_key: key });
  const search = await json(await fetch(`https://serpapi.com/search.json?${params}`, { signal }));
  // SerpApi reports "no results" as an error.
  if (typeof search.error === "string") {
    if (/hasn't returned any results/i.test(search.error)) return [];
    throw new Error(search.error);
  }
  const matches = Array.isArray(search.exact_matches) ? search.exact_matches : [];
  return matches
    .filter((m): m is { link: string; title?: string; source?: string } => typeof m?.link === "string")
    .map((m) => ({ url: m.link, title: String(m.title ?? ""), source: String(m.source ?? "") }));
}

async function aiGeneratedLive(image: Uint8Array, signal: AbortSignal): Promise<number | null> {
  const user = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;
  if (!user || !secret) return null;
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(image)]), "photo");
  form.append("models", "genai");
  form.append("api_user", user);
  form.append("api_secret", secret);
  const body = await json(await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: form, signal }));
  const score = (body.type as { ai_generated?: unknown } | undefined)?.ai_generated;
  if (body.status !== "success" || typeof score !== "number") throw new Error("Sightengine gave no score");
  return score;
}

const RESULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, per docs/architecture.md §6

let redisClient: Redis | undefined;
function redis(): Redis {
  if (!redisClient) redisClient = Redis.fromEnv();
  return redisClient;
}

const redisResults: ResultStore = {
  async saveResult(result) {
    await redis().set(`result:${result.id}`, result, { ex: RESULT_TTL_SECONDS });
  },
  async getResult(id) {
    return (await redis().get<Result>(`result:${id}`)) ?? null;
  },
};

// ponytail: the dev server's replay world keeps Results as JSON files under .data/results
// instead of real Redis, so dev needs no Upstash credentials and costs $0. A plain in-memory
// Map isn't enough here — Next.js's dev server runs route handlers and Server Components in
// separate module graphs, so a module-level Map saved by the Check endpoint isn't the same Map
// the proof page reads. A file survives that. No TTL/expiry; live mode (real Redis, 30-day TTL)
// is what deploys to Vercel. Tests use memoryResults, so nothing piles up here.
const REPLAY_RESULTS_DIR = join(process.cwd(), ".data", "results");

async function replayResultPath(id: string): Promise<string> {
  await mkdir(REPLAY_RESULTS_DIR, { recursive: true });
  return join(REPLAY_RESULTS_DIR, `${id}.json`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fileResults: ResultStore = {
  async saveResult(result) {
    await writeFile(await replayResultPath(result.id), JSON.stringify(result));
  },
  async getResult(id) {
    // `id` comes straight from the proof page's URL, and becomes a file
    // path below — reject anything that isn't the crypto.randomUUID()
    // shape a Check produces, so a path like "../../etc/passwd" can't
    // escape .data/results.
    if (!UUID_RE.test(id)) return null;
    try {
      return JSON.parse(await readFile(await replayResultPath(id), "utf-8"));
    } catch {
      return null;
    }
  },
};

export const liveWorld: World = {
  openai: (_ask, live) => live(client()),
  fetchText: fetchLive,
  reverseImage: reverseImageLive,
  aiGenerated: aiGeneratedLive,
  ...redisResults,
};

/** globalThis, not a module variable: instrumentation.ts and the route handler are separate module graphs. */
const DEMO_SCENARIOS_KEY = Symbol.for("truthagent.demoScenarios");

/** The dev server's replay answers, by Message. Set at server start by instrumentation.ts, so
 * the Engine never imports Scenario data. */
export function setDemoScenarios(scenarios: Record<string, Scenario>): void {
  (globalThis as Record<symbol, unknown>)[DEMO_SCENARIOS_KEY] = scenarios;
}

/** The world a Check gets when none is given: live, or replay of the demo Scenario for this Message. */
export function defaultWorld(message: string): World {
  if (outsideWorldMode() === "live") return liveWorld;
  const demos = (globalThis as Record<symbol, Record<string, Scenario> | undefined>)[DEMO_SCENARIOS_KEY];
  return replayWorld(demos?.[message.trim()] ?? {}, fileResults);
}

/** The proof page's read of a saved Result, from the store the default world saves to. */
export function getResult(id: string): Promise<Result | null> {
  return (outsideWorldMode() === "live" ? redisResults : fileResults).getResult(id);
}
