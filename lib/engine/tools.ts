// Our function tools, run by the agent loop (agent.ts). Every fetch goes
// through the outside-world boundary, so replay mode covers them at $0.
import { fetchText, waybackCdxUrl } from "./boundary.ts";
import { pageFixture } from "./fixtures.ts";
import { isBlocked } from "./sources.ts";

/** Per tool call (the Wayback lookup shares it with the page fetch). */
const TOOL_MS = 8_000;
/** Enough for the model to find a quote; keeps a turn's tokens small. */
const PAGE_TEXT_CHARS = 6_000;

/** Keeps the date as written when the page gives a plain YYYY-MM-DD prefix,
 * so an IST timestamp near midnight doesn't slip a day in UTC. */
function toDay(value: string | undefined): string | null {
  if (!value) return null;
  const plain = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (plain) return plain;
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
  return timestamp ? `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}` : null;
}

// ponytail: regex HTML-to-text, a few named entities, first 6,000 chars only.
// A quote deep in a long page or behind numeric entities won't be seen; use a
// real HTML parser (and the quote check in #5) if that starts dropping Evidence.
function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PAGE_TEXT_CHARS);
}

export interface Page {
  url: string;
  published: string | null;
  date_source: "page" | "wayback" | null;
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
