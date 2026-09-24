// The exact cache, the Claim cache and the per-Claim lock (docs/architecture.md §6). Both caches are
// pointers to a saved Result, so a hit shows the same proof page, instantly and for free.
import { createHash } from "node:crypto";
import type { World } from "./boundary.ts";
import type { Result } from "./schemas.ts";

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Lowercase, single spaces, no emojis and no "Forwarded" label: one Message, however it was pasted. */
function cleaned(text: string): string {
  return text
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200d\ufe0f\u20e3]/gu, "")
    .replace(/\bforwarded( many times)?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same Message: its cleaned text, its photo, and the Claim date only when the user set one. */
export function exactKey(message: string, image: Uint8Array | undefined, claimDate: string | undefined): string {
  return `exact:${sha256([cleaned(message), image ? sha256(image) : "", claimDate ?? ""].join("|"))}`;
}

/** The same Claim, however it was worded or in whatever language: Understand's canonical English, on its Claim date. */
export function claimKey(canonicalEn: string, claimDate: string): string {
  return `claim:${sha256(`${cleaned(canonicalEn).replace(/[.!?]+$/, "")}|${claimDate}`)}`;
}

/** The saved Result a pointer leads to; null when the pointer or its Result has expired. */
export async function cached(world: World, key: string): Promise<Result | null> {
  const id = await world.getKey(key);
  return id ? world.getResult(id) : null;
}

/** A Check that dies holding the lock only holds it this long. */
const LOCK_SECONDS = 120;
/** How often a waiting Check looks for the running one's Result: 1 Redis read per waiter per second.
 * ponytail: waiters poll and stream nothing while they wait (up to LOCK_SECONDS, inside Vercel's 300s);
 * add a "someone is checking this right now" step, or pub/sub, if bursts feel slow. */
const WAIT_MS = 1000;

const lockKey = (key: string) => `lock:${key}`;

/**
 * The Claim cache behind a lock, so a burst of Checks on one Claim runs the pipeline once. Returns the
 * Claim's saved Result, or null once this Check holds the lock and should run (then `unlock` when done).
 * While another Check holds it, waits for that one's Result.
 */
export async function claimResultOrLock(world: World, key: string): Promise<Result | null> {
  for (;;) {
    const hit = await cached(world, key);
    if (hit) return hit;
    if (await world.setKey(lockKey(key), "1", LOCK_SECONDS, true)) return null;
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
}

export function unlock(world: World, key: string): Promise<void> {
  return world.deleteKey(lockKey(key));
}
