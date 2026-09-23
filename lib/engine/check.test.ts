import assert from "node:assert/strict";
import test from "node:test";
import { check, type CheckOptions } from "./check.ts";
import type { CheckEvent } from "./schemas.ts";

async function collect(message: string, options?: CheckOptions): Promise<CheckEvent[]> {
  const events: CheckEvent[] = [];
  for await (const event of check(message, options)) events.push(event);
  return events;
}

test("replay: a Check streams understood, verdict, done and asserts on what a user would see", async () => {
  const events = await collect("Amitabh Bachchan has died, forward this to everyone");

  assert.deepEqual(
    events.map((e) => e.type),
    ["understood", "verdict", "done"],
  );

  const understood = events[0];
  assert.equal(understood.type, "understood");
  if (understood.type === "understood") {
    assert.match(understood.claim.original, /Amitabh Bachchan/);
  }

  const verdict = events[1];
  assert.equal(verdict.type, "verdict");
  if (verdict.type === "verdict") {
    assert.equal(verdict.label, "false");
    assert.ok(verdict.oneLine.length > 0);
  }

  const done = events[2];
  assert.equal(done.type, "done");
});

test("replay: text over 2,000 characters is rejected with a friendly error event", async () => {
  const events = await collect("a".repeat(2001));

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "error");
  if (events[0].type === "error") {
    assert.match(events[0].message, /2,000 characters/);
  }
});

test("replay: check() needs no OPENAI_API_KEY — proof no OpenAI client is ever built", async () => {
  // The OpenAI SDK throws in its constructor when no key is configured, so
  // if replay mode still made it through to a live call, this would throw
  // instead of completing.
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const events = await collect("Some forward");
    assert.ok(events.some((e) => e.type === "done"));
  } finally {
    if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
  }
});
