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
import { isBlocked, isFactChecker, tierOf } from "./sources.ts";
import { failedRead, readPage, type PageRead } from "./tools.ts";

/** Page text the Origin tagger sees per item: the top, where wire credits like "(ANI)" sit.
 * ponytail: a credit at the article's end ("with inputs from PTI") is missed; add the page's
 * last few hundred chars if wire copies get counted as separate Origins. */
const ORIGIN_CONTEXT_CHARS = 1_500;
/** Shorter quotes, like a bare name, would match almost any page on the topic. */
const MIN_QUOTE_WORDS = 4;
/** The model picks the urls, so a chatty turn could ask for a socket per candidate. */
const MAX_PARALLEL_READS = 6;

/** Runs at most `max` tasks at a time, the rest waiting their turn. */
function limiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((resume) => waiting.push(resume));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

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
      "Group the Evidence by Origin: items that carry the same wire story or quote the same statement are one group. " +
      "Each Evidence id goes in exactly one group.",
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
  pagesRead: Map<string, PageRead>,
): AsyncGenerator<CheckEvent, { evidence: Evidence[]; independentSources: number }> {
  // Pages the agent didn't read are fetched now, a few at a time.
  const reads = new Map<string, Promise<PageRead>>();
  const readSlot = limiter(MAX_PARALLEL_READS);
  const read = (url: string) => {
    if (!reads.has(url)) {
      reads.set(
        url,
        pagesRead.has(url)
          ? Promise.resolve(pagesRead.get(url)!)
          : readSlot(() => readPage(url)).catch(failedRead),
      );
    }
    return reads.get(url)!;
  };
  const kept = candidates.flatMap((candidate) => {
    const { stance } = candidate;
    const hostname = hostnameOf(candidate.url);
    if (!hostname || isBlocked(hostname) || stance === "irrelevant") return [];
    if (quoteKey(candidate.quote).split(" ").length < MIN_QUOTE_WORDS) return [];
    return [{ ...candidate, stance, hostname, read: read(candidate.url) }];
  });

  const accepted: Evidence[] = [];
  const pageStart = new Map<string, string>();
  for (const candidate of kept) {
    const outcome = await candidate.read;
    // A page that isn't there means a made-up link; one we couldn't reach keeps its quote, unverified.
    if (outcome === "dead") continue;
    const page = outcome === "unreachable" ? null : outcome;
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
      factCheck: isFactChecker(candidate.hostname),
    };
    accepted.push(item);
    pageStart.set(item.id, page?.text.slice(0, ORIGIN_CONTEXT_CHARS) ?? "");
    yield { type: "evidence", id: item.id, site: item.site, stance: item.stance };
  }
  if (accepted.length === 0) return { evidence: [], independentSources: 0 };

  // Tagging failing leaves Origins unknown (0 Independent sources, so "Not confirmed yet"), not the Check broken.
  const tagged = await callOpenAI({
    fixture: originFixture(accepted),
    live: (client) =>
      liveOrigins(
        client,
        accepted.map((e) => ({ id: e.id, site: e.site, quote: e.quote, page_start: pageStart.get(e.id)! })),
      ),
  }).catch((): OriginsOutput => ({ origins: [] }));

  // Each group is one Independent source; an id claimed twice keeps its first group, unknown ids
  // and groups with no Origin named are ignored. A group of nothing but Fact-checks is a repeat of
  // someone else's verdict, so it is a lead, not an Independent source (CONTEXT.md "Fact-check").
  const originById = new Map<string, string>();
  let independentSources = 0;
  for (const group of tagged.origins) {
    const origin = group.origin.trim();
    const ids = group.evidence_ids.filter((id) => accepted.some((e) => e.id === id) && !originById.has(id));
    if (!origin || ids.length === 0) continue;
    for (const id of ids) originById.set(id, origin);
    if (ids.some((id) => !accepted.find((e) => e.id === id)!.factCheck)) independentSources++;
  }
  // ponytail: an item the tagger leaves out gets no Origin and isn't counted, erring towards
  // "Not confirmed yet"; count each as its own Origin if that under-counts in the accuracy run.
  const evidence = accepted.map((e) => ({ ...e, origin: originById.get(e.id) ?? null }));
  return { evidence, independentSources };
}
