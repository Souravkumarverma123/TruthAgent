// Our function tools, run by the agent loop (agent.ts). Every fetch goes
// through the outside-world boundary, so replay mode covers them at $0.
import { fetchText, waybackCdxUrl } from "./boundary.ts";
import { pageFixture } from "./fixtures.ts";
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

async function earliestWaybackDay(url: string, signal: AbortSignal): Promise<string | null> {
  const cdx = waybackCdxUrl(url);
  const rows: string[][] = JSON.parse(await fetchText(cdx, { signal, fixture: pageFixture(cdx) }));
  const timestamp = rows[1]?.[0];
  if (!timestamp) return null;
  return calendarDay(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`);
}

function codePoint(n: number): string {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
}

// ponytail: regex HTML-to-text and a few named entities; use a real HTML
// parser if the quote check starts dropping Evidence it shouldn't.
function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&amp;/g, "&")
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

/** The `read_page` tool: page text plus a published date, from the page itself else the earliest Wayback copy. */
export async function readPage(url: string): Promise<Page> {
  if (isBlocked(new URL(url).hostname)) throw new Error("This site is on the block list");
  const signal = AbortSignal.timeout(TOOL_MS);
  const html = await fetchText(url, { signal, fixture: pageFixture(url) });
  const fromPage = publishedDateFromPage(html);
  const fromWayback = fromPage ? null : await earliestWaybackDay(url, signal).catch(() => null);
  return {
    url,
    published: fromPage ?? fromWayback,
    date_source: fromPage ? "page" : fromWayback ? "wayback" : null,
    text: pageText(html),
  };
}
