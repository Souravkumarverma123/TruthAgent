// Evidence processing (docs/architecture.md §5 ⑥): code, not the model, decides
// which Evidence is kept. Block list and quote check, then tier and date, then
// one luna call tags each item's Origin, and distinct Origins are counted as
// Independent sources.
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { callOpenAI } from "./boundary.ts";
import { originFixture } from "./fixtures.ts";
import { MODELS } from "./models.ts";
import { OriginsSchema, type CheckEvent, type Evidence, type EvidenceCandidate, type OriginsOutput } from "./schemas.ts";
import { isBlocked, tierOf } from "./sources.ts";
import { readPage, type Page } from "./tools.ts";

/** Page text the Origin tagger sees per item: the top, where wire credits like "(ANI)" sit. */
const ORIGIN_CONTEXT_CHARS = 1_500;

/** Case, spacing, and curly vs straight quotes and dashes don't count against a quote. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A quote's checkable core: without the quote marks, ellipses or full stop the model may wrap it in. */
function quoteKey(quote: string): string {
  return normalize(quote).replace(/^["'.…\s]+|["'.…\s]+$/g, "");
}

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : null;
  } catch {
    return null;
  }
}

async function liveOrigins(
  client: OpenAI,
  items: { id: string; site: string; quote: string; page_start: string }[],
): Promise<OriginsOutput> {
  const response = await client.responses.parse({
    model: MODELS.luna,
    instructions:
      "For each piece of Evidence, say where its information first comes from: its Origin. Name who, e.g. " +
      "\"Alt News's own reporting\", \"ANI wire\", \"PTI wire\", \"Bachchan family statement\", \"RBI press release\", " +
      "\"a post by @handle on X\". Look for wire credits such as (ANI) or 'with inputs from PTI' in page_start. " +
      "Items that carry the same wire story or quote the same statement share one Origin: give them exactly the same text.",
    input: JSON.stringify(items),
    text: { format: zodTextFormat(OriginsSchema, "origins") },
  });
  if (!response.output_parsed) throw new Error("Origin tagging returned no output");
  return response.output_parsed;
}

/**
 * Turns the agent's Evidence candidates into Evidence a user can trust.
 * Streams an `evidence` event per accepted item; returns the Evidence
 * (ids E1…En) and the Independent-source count.
 */
export async function* processEvidence(
  candidates: EvidenceCandidate[],
  pagesRead: Map<string, Page | null>,
): AsyncGenerator<CheckEvent, { evidence: Evidence[]; independentSources: number }> {
  // Pages the agent didn't read are fetched now, in parallel; null = couldn't be fetched.
  const reads = new Map<string, Promise<Page | null>>();
  const read = (url: string) => {
    if (!reads.has(url)) {
      reads.set(url, pagesRead.has(url) ? Promise.resolve(pagesRead.get(url)!) : readPage(url).catch(() => null));
    }
    return reads.get(url)!;
  };
  const kept = candidates.flatMap((candidate) => {
    const hostname = hostnameOf(candidate.url);
    if (!hostname || isBlocked(hostname) || candidate.stance === "irrelevant" || !quoteKey(candidate.quote)) return [];
    return [{ ...candidate, stance: candidate.stance, hostname, page: read(candidate.url) }];
  });

  const accepted: Evidence[] = [];
  const pageStart = new Map<string, string>();
  for (const candidate of kept) {
    const page = await candidate.page;
    if (page && !normalize(page.text).includes(quoteKey(candidate.quote))) continue;
    const item: Evidence = {
      id: `E${accepted.length + 1}`,
      url: candidate.url,
      site: candidate.hostname.replace(/^www\./, ""),
      tier: tierOf(candidate.hostname),
      date: page?.published ?? null,
      quote: candidate.quote.trim(),
      quoteVerified: page !== null,
      stance: candidate.stance,
      origin: null,
    };
    accepted.push(item);
    pageStart.set(item.id, page?.text.slice(0, ORIGIN_CONTEXT_CHARS) ?? "");
    yield { type: "evidence", id: item.id, site: item.site, stance: item.stance };
  }
  if (accepted.length === 0) return { evidence: [], independentSources: 0 };

  const tagged = await callOpenAI({
    fixture: originFixture(accepted),
    live: (client) =>
      liveOrigins(
        client,
        accepted.map((e) => ({ id: e.id, site: e.site, quote: e.quote, page_start: pageStart.get(e.id)! })),
      ),
  });
  const originById = new Map(tagged.origins.map((o) => [o.id, o.origin.trim()]));
  const evidence = accepted.map((e) => ({ ...e, origin: originById.get(e.id) || null }));
  // ponytail: distinct Origin text, case-insensitive; relies on the tagger reusing the exact
  // text for a shared Origin. Group ids in the tagger's output if near-duplicates slip through.
  const independentSources = new Set(evidence.flatMap((e) => (e.origin ? [e.origin.toLowerCase()] : []))).size;
  return { evidence, independentSources };
}
