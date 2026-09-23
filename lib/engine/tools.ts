// Our function tools, run by the agent loop (agent.ts). Every fetch goes
// through the Check's World, so replay mode covers them at $0.
import { ReplayGap, waybackCdxUrl, type World } from "./boundary.ts";
import { isBlocked } from "./sources.ts";

/** Per tool call (the Wayback lookup shares it with the page fetch). */
const TOOL_MS = 8_000;

/** A YYYY-MM-DD string that is a real calendar day, else null. Round-tripping
 * through Date rejects both unparseable days and ones it would roll over,
 * such as 2026-02-30. */
function calendarDay(day: string): string | null {
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

/** Keeps the date as written when the page gives a plain YYYY-MM-DD prefix,
 * so an IST timestamp near midnight doesn't slip a day in UTC. */
function toDay(value: string | undefined): string | null {
  if (!value) return null;
  const plain = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (plain) return calendarDay(plain);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const DATE_META_RE =
  /(?:property|name|itemprop)\s*=\s*["'](?:article:published_time|og:published_time|datePublished|pubdate|publish-date|date)["']/i;

function publishedDateFromPage(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!DATE_META_RE.test(tag)) continue;
    const day = toDay(/content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
    if (day) return day;
  }
  return toDay(/"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1]);
}

async function earliestWaybackDay(world: World, url: string, signal: AbortSignal): Promise<string | null> {
  const rows: string[][] = JSON.parse(await world.fetchText(waybackCdxUrl(url), signal));
  const timestamp = rows[1]?.[0];
  if (!timestamp) return null;
  return calendarDay(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`);
}

function codePoint(n: number): string {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
}

/** The named references news pages actually write, above all the punctuation a
 * quote can carry: a page writing `&rsquo;` must still match a quote written `’`. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  quot: '"',
  apos: "'",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  lsaquo: "‹",
  rsaquo: "›",
  laquo: "«",
  raquo: "»",
  prime: "′",
  Prime: "″",
  ndash: "–",
  mdash: "—",
  minus: "−",
  hellip: "…",
  bull: "•",
  middot: "·",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  dagger: "†",
  Dagger: "‡",
  sect: "§",
  para: "¶",
  lt: "<",
  gt: ">",
  amp: "&",
};

/** Character references back to their characters, so the quote check compares text with
 * text. One left-to-right pass, so `&amp;rsquo;` decodes to the literal text `&rsquo;`.
 * A name we don't know is left as written rather than guessed at. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

// ponytail: regex HTML-to-text and a table of named references; use a real HTML
// parser if the quote check starts dropping Evidence it shouldn't.
function pageText(html: string): string {
  return decodeEntities(
    html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export interface Page {
  url: string;
  published: string | null;
  date_source: "page" | "wayback" | null;
  /** The whole page's text; the agent shows the model only the start of it. */
  text: string;
}

/** What reading a page came to: the page, or why not. "dead" means the page isn't
 * there (404, no such domain), so a url the model made up; "unreachable" means
 * it may exist but couldn't be read just now (timeout, 403, 5xx). */
export type PageRead = Page | "dead" | "unreachable";

export function failedRead(error: unknown): "dead" | "unreachable" {
  if (error instanceof ReplayGap) throw error;
  if (!(error instanceof Error)) return "unreachable";
  const code = (error as NodeJS.ErrnoException).code;
  const dead =
    code === "ENOTFOUND" ||
    code === "ERR_INVALID_URL" ||
    /^HTTP (404|410)$|^Not a public web page$|block list/.test(error.message);
  return dead ? "dead" : "unreachable";
}

/** The `read_page` tool: page text plus a published date, from the page itself else the earliest Wayback copy. */
export async function readPage(world: World, url: string): Promise<Page> {
  if (isBlocked(new URL(url).hostname)) throw new Error("This site is on the block list");
  const signal = AbortSignal.timeout(TOOL_MS);
  const html = await world.fetchText(url, signal);
  const fromPage = publishedDateFromPage(html);
  const fromWayback = fromPage ? null : await earliestWaybackDay(world, url, signal).catch((error) => {
        if (error instanceof ReplayGap) throw error;
        return null;
      });
  return {
    url,
    published: fromPage ?? fromWayback,
    date_source: fromPage ? "page" : fromWayback ? "wayback" : null,
    text: pageText(html),
  };
}
