import assert from "node:assert/strict";
import test from "node:test";
import { replayWorld } from "./boundary.ts";
import { check } from "./check.ts";
import { paced } from "./demo-pace.ts";
import * as scenarios from "./scenarios.ts";
import type { CheckEvent } from "./schemas.ts";

async function collect(events: AsyncIterable<CheckEvent>): Promise<CheckEvent[]> {
  const all: CheckEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

const BACHCHAN = "Amitabh Bachchan has died, forward this to everyone";

test("demo pace: a Check shows the same events in the same order, spread over the time asked", async () => {
  const plain = await collect(check(BACHCHAN, { world: replayWorld(scenarios.BACHCHAN) }));

  const started = Date.now();
  const shown = await collect(paced(check(BACHCHAN, { world: replayWorld(scenarios.BACHCHAN) }), 400));
  const took = Date.now() - started;

  // ids differ run to run (a Result's uuid), so compare what a user sees: the kinds and the step lines.
  const seen = (events: CheckEvent[]) => events.map((e) => (e.type === "step" ? `${e.status}: ${e.line}` : e.type));
  assert.deepEqual(seen(shown), seen(plain));
  assert.ok(took >= 350 && took < 1_000, `took ${took}ms`);
});

test("demo pace: a Check with no steps, like a Message over the length limit, answers at once", async () => {
  const started = Date.now();
  const shown = await collect(paced(check("x".repeat(3_000), { world: replayWorld({}) }), 2_000));
  assert.equal(shown.length, 1);
  assert.equal(shown[0].type, "error");
  assert.ok(Date.now() - started < 500);
});
