// The Photo check (CONTEXT.md): is the photo real, and where and when did it first appear?
// Reverse image search is the main signal, dated by reading the top matches; EXIF only supports
// it. Decided by code, apart from the Verdict.
import { tolerate, type World } from "./boundary.ts";
import type { AgentStep, CheckEvent, Exif, ImageMatch, MessageImage, PhotoCheck } from "./schemas.ts";
import { isBlocked } from "./sources.ts";
import { readPage } from "./tools.ts";

/** Matches read for a date. SerpApi gives none, and each read can take up to 8s, so only the top
 * few, in parallel. ponytail: the earliest copy may sit lower down the list; read more if
 * "earliest copy we found" is often a reshare. */
const DATED_MATCHES = 3;
const SEARCH_MS = 15_000;

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

function pagesText(count: number): string {
  return count === 1 ? "1 other page" : `${count} other pages`;
}

/** Real means an earlier copy: a dated page from before the Claim date. Copies alone aren't enough,
 * since a viral fake is copied too. "no" needs proof of editing, which nothing here gives. */
function judge(
  matches: number | null,
  earliest: PhotoCheck["earliest"],
  claimDate: string,
): Pick<PhotoCheck, "real" | "reason"> {
  if (matches === null) return { real: "unknown", reason: "The photo search didn't work, so we can't tell where it came from." };
  if (matches === 0) return { real: "unknown", reason: "We found no other copy of this photo, so we can't tell where it came from." };
  if (!earliest || earliest.date >= claimDate) {
    return { real: "unknown", reason: `The photo appears on ${pagesText(matches)}, but none dated earlier, so we can't tell where it came from.` };
  }
  return { real: "yes", reason: `The same photo was published earlier, on ${pagesText(matches)}, so it wasn't made for this story.` };
}

/** Runs the Photo check, streaming its steps as `step` events like the agent's. */
export async function* photoCheck(
  world: World,
  image: MessageImage,
  description: string | null,
  claimDate: string,
): AsyncGenerator<CheckEvent, { photoCheck: PhotoCheck; steps: AgentStep[] }> {
  const steps = new Map<string, AgentStep>();
  function step(id: string, line: string, status: AgentStep["status"]): CheckEvent {
    const agentStep: AgentStep = { tool: "reverse_image", line, status };
    steps.set(id, agentStep);
    return { type: "step", id, ...agentStep };
  }

  yield step("p1", "Finding where this photo appeared before…", "running");
  const matches = await world.reverseImage(image.bytes, AbortSignal.timeout(SEARCH_MS)).catch(tolerate(() => null));
  if (matches === null) {
    yield step("p1", "Couldn't search for this photo", "failed");
  } else {
    yield step("p1", matches.length ? `Found this photo on ${pagesText(matches.length)}` : "Found no other copy of this photo", "done");
  }

  let earliest: PhotoCheck["earliest"] = null;
  if (matches?.length) {
    yield step("p2", "Dating the earliest copies…", "running");
    earliest = await earliestCopy(world, matches);
    yield earliest
      ? step("p2", `Earliest copy we found: ${earliest.site}, ${DAY_FORMAT.format(new Date(earliest.date))}`, "done")
      : step("p2", "Couldn't date the copies", "failed");
  }

  const exif: Exif | null = image.exif ?? null;
  return {
    photoCheck: { ...judge(matches?.length ?? null, earliest, claimDate), earliest, matches: matches?.length ?? null, exif, description },
    steps: [...steps.values()],
  };
}
