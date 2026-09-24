// Demo pacing. Replay answers in milliseconds, so a demo Check would flash its whole answer at once.
// This takes a finished Check's events and shows them spread over a few seconds, so the step list
// reads like the agent doing the work. Only the endpoint uses it, in replay mode: the Engine and live are untouched.
import type { CheckEvent } from "./schemas.ts";

/** How long a whole demo Check takes on screen. */
export const DEMO_CHECK_MS = 4_000;

/** A pause's share of the total, by the event it comes before: "running" is a quick start,
 * the line that finishes it is the work, and `done` leaves "Verdict ready" on screen a beat before the page opens. */
function weight(event: CheckEvent): number {
  if (event.type === "step") return event.status === "running" ? 1 : 2;
  if (event.type === "evidence" || event.type === "done") return 1;
  return 2;
}

const sleep = (ms: number) => new Promise((resume) => setTimeout(resume, ms));

/** The same events, in the same order, `totalMs` in all. A Check with no steps (a cache hit, an
 * error) had no work to show, so it answers at once. */
export async function* paced(events: AsyncIterable<CheckEvent>, totalMs = DEMO_CHECK_MS): AsyncGenerator<CheckEvent> {
  const all: CheckEvent[] = [];
  for await (const event of events) all.push(event);
  if (!all.some((event) => event.type === "step")) {
    yield* all;
    return;
  }
  const sum = all.reduce((total, event) => total + weight(event), 0);
  for (const event of all) {
    await sleep((totalMs * weight(event)) / sum);
    yield event;
  }
}
