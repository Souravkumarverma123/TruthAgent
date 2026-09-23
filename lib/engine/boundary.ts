// The outside-world boundary: every call to OpenAI, Redis or a web page goes through here.
// Two modes, per AGENTS.md: `live` (real calls, costs money) and `replay`
// (canned data, $0, no network). Replay is the default in dev and tests.
import { Redis } from "@upstash/redis";
import { lookup as dnsLookup } from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
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
 * ponytail: replay mode returns the fixture the caller picked (fixtures.ts
 * picks by scenario: which claim, which model, which run), not a
 * request-hash-keyed recording. Upgrade to hash-keyed fixtures
 * (docs/architecture.md §7) when picking by claim text stops scaling.
 */
export async function callOpenAI<T>(params: { fixture: T; live: (client: OpenAI) => Promise<T> }): Promise<T> {
  if (outsideWorldMode() === "replay") return params.fixture;
  return params.live(client());
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

/**
 * Fetches a web page (or Wayback API) as text. In replay mode, `fixture` is
 * the recorded body for this exact URL, or its HTTP error status; no
 * recording means the fetch fails, just like an unreachable page would live.
 */
export async function fetchText(
  url: string,
  params: { signal: AbortSignal; fixture: string | number | undefined },
): Promise<string> {
  if (outsideWorldMode() === "replay") {
    if (params.fixture === undefined) throw new Error(`No replay recording for ${url}`);
    if (typeof params.fixture === "number") throw new Error(`HTTP ${params.fixture}`);
    return params.fixture;
  }
  // Redirects are followed by hand so every hop gets the public-URL check.
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpUrl(current)) throw new Error("Not a public web page");
    const response = await requestPage(current, params.signal);
    if (response.status >= 300 && response.status < 400 && response.location) {
      current = new URL(response.location, current);
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return response.body;
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
