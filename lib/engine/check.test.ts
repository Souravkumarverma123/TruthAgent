import assert from "node:assert/strict";
import test from "node:test";
import { getResult } from "./boundary.ts";
import { check, type CheckOptions } from "./check.ts";
import type { CheckEvent } from "./schemas.ts";

async function collect(message: string, options?: CheckOptions): Promise<CheckEvent[]> {
  const events: CheckEvent[] = [];
  for await (const event of check(message, options)) events.push(event);
  return events;
}

test("replay: a Check streams understood, agent steps, verdict, done and asserts on what a user would see", async () => {
  const events = await collect("Amitabh Bachchan has died, forward this to everyone");

  const types = events.map((e) => e.type);
  assert.equal(types[0], "understood");
  assert.ok(types.slice(1, -2).every((t) => t === "step"));
  assert.deepEqual(types.slice(-2), ["verdict", "done"]);

  const understood = events[0];
  if (understood.type === "understood") {
    assert.match(understood.claim.original, /Amitabh Bachchan/);
  }

  const verdict = events.at(-2)!;
  if (verdict.type === "verdict") {
    assert.equal(verdict.label, "false");
    assert.ok(verdict.oneLine.length > 0);
  }
});

function steps(events: CheckEvent[]) {
  return events.filter((e) => e.type === "step");
}

test("replay: every agent tool call streams running, then done or failed, with a plain-language line", async () => {
  const stepEvents = steps(await collect("Amitabh Bachchan has died, forward this to everyone"));
  const ids = [...new Set(stepEvents.map((s) => s.id))];

  assert.ok(ids.length > 0 && ids.length <= 8, "at most 8 agent steps");
  assert.ok(stepEvents.filter((s) => s.tool === "web_search" && s.status !== "running").length <= 3, "at most 3 web searches");
  for (const id of ids) {
    const forId = stepEvents.filter((s) => s.id === id);
    assert.equal(forId[0].status, "running");
    assert.match(forId.at(-1)!.status, /^(done|failed)$/);
    assert.ok(forId.every((s) => s.line.length > 0 && !s.line.includes("http")));
  }
});

test("replay: a failed read_page goes back to the model and the Check still finishes", async () => {
  const events = await collect("Amitabh Bachchan has died, forward this to everyone");
  const failed = steps(events).find((s) => s.tool === "read_page" && s.status === "failed");

  assert.ok(failed, "a failed read_page step is shown");
  assert.match(failed.line, /Couldn't read/);
  assert.ok(events.indexOf(failed) < events.findIndex((e) => e.type === "verdict"));
  assert.equal(events.at(-1)!.type, "done");
});

test("replay: read_page shows the page's published date, else the earliest Wayback copy", async () => {
  const done = steps(await collect("Amitabh Bachchan has died, forward this to everyone")).filter(
    (s) => s.tool === "read_page" && s.status === "done",
  );

  assert.ok(done.some((s) => /published 12 Mar 2024/.test(s.line)), "date from page metadata");
  assert.ok(done.some((s) => /earliest archived copy 5 Jan 2004/.test(s.line)), "date from Wayback");
});

test("replay: a page whose metadata date isn't a real day is still read", async () => {
  const done = steps(await collect("Amitabh Bachchan has died, forward this to everyone")).filter(
    (s) => s.tool === "read_page" && s.status === "done",
  );

  assert.ok(done.some((s) => /dailyroundup/.test(s.line) && /no date found/.test(s.line)));
});

test("replay: the proof page's Result keeps the agent steps as the user last saw them", async () => {
  const events = await collect("Amitabh Bachchan has died, forward this to everyone");
  const done = events.at(-1)!;
  assert.equal(done.type, "done");
  const result = await getResult(done.type === "done" ? done.id : "");

  const lastLines = new Map(steps(events).map((s) => [s.id, s.line]));
  assert.deepEqual(
    result?.steps.map((s) => s.line),
    [...lastLines.values()],
  );
  assert.ok(result?.steps.every((s) => s.status !== "running"));
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
