// The Engine's one entry point (AGENTS.md: "One test seam"). Understand →
// agent loop (agent.ts) → Evidence processing (evidence.ts) → Verdict (verdict.ts) → save. See docs/architecture.md §5
// for the full pipeline this tracer bullet is the first slice of.
import type OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { agentLoop } from "./agent.ts";
import { defaultWorld, ReplayGap, type World } from "./boundary.ts";
import { cached, claimKey, claimResultOrLock, exactKey, unlock } from "./cache.ts";
import { processEvidence } from "./evidence.ts";
import { MODELS } from "./models.ts";
import { photoCheck } from "./photo.ts";
import { cacheSeconds } from "./sources.ts";
import { calendarDay } from "./tools.ts";
import {
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  NOT_AN_IMAGE,
  PHOTO_TOO_BIG,
  UnderstandSchema,
  type CheckEvent,
  type ImageType,
  type MessageImage,
  type Result,
  type Understood,
} from "./schemas.ts";
import { judge } from "./verdict.ts";

export interface CheckOptions {
  /** "When did you get this?" (YYYY-MM-DD): the day the Claim is judged as of. Defaults to today. */
  claimDate?: string;
  /** The outside world. Tests pass a replay world; otherwise the one OUTSIDE_WORLD_MODE picks. */
  world?: World;
  /** The Message's photo or screenshot, if any. */
  image?: MessageImage;
  /** Who is asking, for the per-person limit on new Checks. */
  ip?: string;
  /** The team's demo pass: no limit on new Checks. The endpoint checks the secret; the Engine never sees it. */
  demoPass?: boolean;
  /** Re-check: skip both caches and run a fresh Check, whose Result the caches then give out. */
  recheck?: boolean;
}

/** The file type, from the file's own first bytes rather than what the upload claims. */
function imageType(bytes: Uint8Array): ImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(1, 4) === "PNG" && bytes[0] === 0x89) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function liveUnderstand(client: OpenAI, message: string, image: MessageImage | undefined): Promise<Understood> {
  const content: ResponseInputContent[] = [{ type: "input_text", text: message || "(No text, only the image.)" }];
  if (image) {
    const dataUrl = `data:${imageType(image.bytes)};base64,${Buffer.from(image.bytes).toString("base64")}`;
    content.push({ type: "input_image", image_url: dataUrl, detail: "auto" });
  }
  const response = await client.responses.parse({
    model: MODELS.luna,
    instructions:
      "Read the forwarded message and find the one Claim it's really about " +
      "(the Main claim). Give it back as a short original excerpt, a " +
      "canonical English sentence suitable for a web search, and its Claim type. " +
      "The message may come with a photo or a screenshot: give the text written in it as image_text, " +
      "and what it shows in one plain sentence as image_description. A Claim can come from the typed text, " +
      "the text in the image, or both. If there is nothing checkable (e.g. a photo with no text or caption), " +
      "main_claim is null: never make up a Claim from what a photo shows.",
    input: [{ role: "user", content }],
    text: { format: zodTextFormat(UnderstandSchema, "understand") },
  });
  if (!response.output_parsed) throw new Error("Understand step returned no output");
  return response.output_parsed;
}

const HOUR = 60 * 60;
const IP_LIMIT = 5;
const DAY_LIMIT = 30;
const ipCounter = (ip: string) => `checks:ip:${ip}`;
const DAY_COUNTER = "checks:day";

/** Why a new Check can't run, or null if it can. The person's own hour is counted first, so Checks
 * turned away by it never use up the site's day (docs/architecture.md §7). */
async function limitMessage(world: World, ip: string): Promise<string | null> {
  if ((await world.count(ipCounter(ip), HOUR)) > IP_LIMIT) {
    return `You've run ${IP_LIMIT} new checks this hour, the most one person can. Please try again later.`;
  }
  if ((await world.count(DAY_COUNTER, 24 * HOUR)) > DAY_LIMIT) {
    // Only an exact repeat skips the limit: a reworded Claim needs Understand, which the limit guards.
    return "We're busy: today's new checks are used up. A message we've already checked still gets its answer, and links to finished checks still open. Please come back tomorrow.";
  }
  return null;
}

/** Gives back a Check's count toward both limits: for a cache hit known only after Understand. */
async function uncountLimits(world: World, ip: string): Promise<void> {
  await Promise.all([world.uncount(ipCounter(ip)), world.uncount(DAY_COUNTER)]);
}

/**
 * Runs one Check on a Message and streams its progress, ending in a saved
 * Result. Tests go in through this function and assert only on what a user
 * could see: labels, Evidence, and these step events (AGENTS.md).
 */
export async function* check(message: string, options: CheckOptions = {}): AsyncGenerator<CheckEvent, void> {
  if (message.length > MAX_MESSAGE_LENGTH) {
    yield {
      type: "error",
      message: `That message is too long — please paste up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`,
    };
    return;
  }

  const { image } = options;
  if (image && !imageType(image.bytes)) {
    yield { type: "error", message: NOT_AN_IMAGE };
    return;
  }
  if (image && image.bytes.length > MAX_IMAGE_BYTES) {
    yield { type: "error", message: PHOTO_TOO_BIG };
    return;
  }

  // It goes into the agent's and the Verdict's prompts, so only a real day gets in. A day ahead of UTC's
  // is allowed: it's already tomorrow in India for part of UTC's day.
  const tomorrow = new Date(Date.now() + 24 * HOUR * 1000).toISOString().slice(0, 10);
  if (options.claimDate !== undefined && !(calendarDay(options.claimDate) && options.claimDate <= tomorrow)) {
    yield { type: "error", message: "That date doesn't work — please pick a day up to today." };
    return;
  }

  const claimDate = options.claimDate ?? new Date().toISOString().slice(0, 10);
  const world = options.world ?? defaultWorld(message, claimDate);
  const exact = exactKey(message, image?.bytes, options.claimDate);
  const hitEvents = (hit: "exact" | "claim", result: Result): CheckEvent[] => [
    { type: "cache", hit, id: result.id },
    { type: "done", id: result.id },
  ];
  let locked: string | null = null;

  try {
    // The same Message again: no AI call, so it returns before the limit and never counts.
    const exactHit = options.recheck ? null : await cached(world, exact);
    if (exactHit) {
      yield* hitEvents("exact", exactHit);
      return;
    }

    // Every new Check counts, from its first paid call (Understand), so a public link can't run Understand
    // unlimited. ponytail: no IP (only local runs) means one shared bucket.
    const ip = options.ip ?? "unknown";
    const limit = options.demoPass ? null : await limitMessage(world, ip);
    if (limit) {
      yield { type: "error", message: limit };
      return;
    }

    const understood = await world.openai({ step: "understand" }, (client) => liveUnderstand(client, message, image));
    const claim = understood.main_claim;
    const mainClaim = claim && { original: claim.original, canonicalEn: claim.canonical_en };
    yield { type: "understood", claim: mainClaim };

    const claimCache = claim && claimKey(claim.canonical_en, claimDate);
    if (claimCache && !options.recheck) {
      const claimHit = await claimResultOrLock(world, claimCache);
      if (claimHit) {
        // Known only after Understand, so this Check was counted: its count goes back. This wording
        // gets its own exact pointer, so next time it skips Understand and the limit too.
        if (!options.demoPass) await uncountLimits(world, ip);
        await world.setKey(exact, claimHit.id, cacheSeconds(claim.claim_type, claimHit));
        yield* hitEvents("claim", claimHit);
        return;
      }
      locked = claimCache;
    }

    // ponytail: the Photo check runs before the agent, adding its ~10s to a Check with a photo;
    // run the two side by side if that feels slow.
    const photo = image ? yield* photoCheck(world, image, understood.image_description, claimDate) : null;

    let checked: Pick<Result, "verdict" | "evidence" | "steps"> = { verdict: null, evidence: [], steps: [] };
    if (claim) {
      const { candidates, steps, pages } = yield* agentLoop(
        { canonicalEn: claim.canonical_en, claimType: claim.claim_type },
        claimDate,
        world,
      );
      const evidence = yield* processEvidence(candidates, pages, world);
      const verdict = await judge(claim.canonical_en, claimDate, evidence, world);
      yield { type: "verdict", label: verdict.label, oneLine: verdict.oneLine, escalated: verdict.trigger !== null };
      checked = { verdict, evidence, steps };
    }

    const result: Result = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      claimDate,
      message: { text: message, imageText: understood.image_text },
      mainClaim,
      ...checked,
      steps: [...(photo?.steps ?? []), ...checked.steps],
      photoCheck: photo?.photoCheck ?? null,
    };
    await world.saveResult(result);
    const seconds = cacheSeconds(claim?.claim_type ?? null, result);
    await Promise.all([exact, claimCache].map((key) => key && world.setKey(key, result.id, seconds)));
    yield { type: "done", id: result.id };
  } catch (error) {
    // Only replay has gaps, so only dev and tests ever see this message.
    const message = error instanceof ReplayGap ? error.message : "Something went wrong while checking this. Please try again.";
    yield { type: "error", message };
  } finally {
    // Also runs if the person leaves mid-Check; checks waiting on this Claim then run it themselves.
    // A failed unlock is left to the lock's expiry.
    if (locked) await unlock(world, locked).catch(() => {});
  }
}
