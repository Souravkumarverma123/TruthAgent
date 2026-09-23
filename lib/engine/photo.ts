// The Photo check (CONTEXT.md): is the photo real, and where and when did it first appear?
// Reverse image search is the main signal, dated by reading the top matches; EXIF and the
// "AI-generated" score only support it. Decided by code, apart from the Verdict.
import { tolerate, type World } from "./boundary.ts";
import type { AgentStep, CheckEvent, Exif, ImageMatch, MessageImage, PhotoCheck } from "./schemas.ts";
import { isBlocked } from "./sources.ts";
import { readPage } from "./tools.ts";

/** Matches read for a date. SerpApi gives none, and each read can take up to 8s, so only the top
 * few, in parallel. ponytail: the earliest copy may sit lower down the list; read more if
 * "earliest copy we found" is often a reshare. */
const DATED_MATCHES = 3;
const SEARCH_MS = 15_000;
/** At or above this, the detector's score is worth saying; with no earlier copy found, it says "no". */
const LIKELY_AI = 0.9;
const MAYBE_AI = 0.5;

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function siteOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function earliestCopy(world: World, matches: ImageMatch[]): Promise<PhotoCheck["earliest"]> {
  const readable = matches.filter((m) => URL.canParse(m.url) && !isBlocked(new URL(m.url).hostname)).slice(0, DATED_MATCHES);
  const pages = await Promise.all(readable.map((m) => readPage(world, m.url).catch(tolerate(() => null))));
  const dated = pages.filter((p) => p?.published).map((p) => ({ url: p!.url, site: siteOf(p!.url), date: p!.published! }));
  return dated.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

function judge(matches: number | null, ai: number | null): Pick<PhotoCheck, "real" | "reason"> {
  const aiNote = ai !== null && ai >= MAYBE_AI ? `an AI detector rates it ${Math.round(ai * 100)}% likely AI-generated` : null;
  if (matches === null) return { real: "unknown", reason: "The photo search didn't work, so we can't tell where it came from." };
  if (matches === 0) {
    return ai !== null && ai >= LIKELY_AI
      ? { real: "no", reason: `We found no earlier copy of this photo, and ${aiNote}.` }
      : { real: "unknown", reason: "We found no other copy of this photo, so we can't tell where it came from." };
  }
  if (aiNote) return { real: "unknown", reason: `Copies of this photo exist, but ${aiNote}.` };
  return {
    real: "yes",
    reason: `The same photo appears on ${matches === 1 ? "1 other page" : `${matches} other pages`}, so it wasn't made for this forward.`,
  };
}

/** Runs the Photo check, streaming its steps as `step` events like the agent's. */
export async function* photoCheck(
  world: World,
  image: MessageImage,
  description: string | null,
): AsyncGenerator<CheckEvent, { photoCheck: PhotoCheck; steps: AgentStep[] }> {
  const steps = new Map<string, AgentStep>();
  function step(id: string, agentStep: AgentStep): CheckEvent {
    steps.set(id, agentStep);
    return { type: "step", id, ...agentStep };
  }

  yield step("p1", { tool: "reverse_image", line: "Finding where this photo appeared before…", status: "running" });
  const signal = AbortSignal.timeout(SEARCH_MS);
  const [matches, aiGenerated] = await Promise.all([
    world.reverseImage(image.bytes, signal).catch(tolerate(() => null)),
    world.aiGenerated(image.bytes, signal).catch(tolerate(() => null)),
  ]);
  if (matches === null) {
    yield step("p1", { tool: "reverse_image", line: "Couldn't search for this photo", status: "failed" });
  } else {
    const line =
      matches.length === 0
        ? "Found no other copy of this photo"
        : `Found this photo on ${matches.length === 1 ? "1 other page" : `${matches.length} other pages`}`;
    yield step("p1", { tool: "reverse_image", line, status: "done" });
  }

  let earliest: PhotoCheck["earliest"] = null;
  if (matches?.length) {
    yield step("p2", { tool: "reverse_image", line: "Dating the earliest copies…", status: "running" });
    earliest = await earliestCopy(world, matches);
    yield step(
      "p2",
      earliest
        ? { tool: "reverse_image", line: `Earliest copy we found: ${earliest.site}, ${DAY_FORMAT.format(new Date(earliest.date))}`, status: "done" }
        : { tool: "reverse_image", line: "Couldn't date the copies", status: "failed" },
    );
  }

  const exif: Exif | null = image.exif ?? null;
  return {
    photoCheck: { ...judge(matches?.length ?? null, aiGenerated), earliest, matches: matches?.length ?? null, exif, aiGenerated, description },
    steps: [...steps.values()],
  };
}
