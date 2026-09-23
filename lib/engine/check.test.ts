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

test("replay: a Check streams understood, agent steps, evidence, verdict, done and asserts on what a user would see", async () => {
  const events = await collect("Amitabh Bachchan has died, forward this to everyone");

  const types = events.map((e) => e.type);
  assert.equal(types[0], "understood");
  const middle = types.slice(1, -2).join(" ");
  assert.match(middle, /^(step )+(evidence ?)+$/);
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

async function resultOf(events: CheckEvent[]) {
  const done = events.at(-1)!;
  assert.equal(done.type, "done");
  const result = await getResult(done.type === "done" ? done.id : "");
  assert.ok(result);
  return result;
}

const BACHCHAN = "Amitabh Bachchan has died, forward this to everyone";

test("replay: the proof page's Evidence has For and Against sides, each item with site, tier, date, quote and Origin", async () => {
  const result = await resultOf(await collect(BACHCHAN));

  const altNews = result.evidence.find((e) => e.site === "altnews.in");
  assert.deepEqual(
    { ...altNews, quote: undefined, url: undefined },
    {
      id: altNews?.id,
      site: "altnews.in",
      tier: 2,
      date: "2024-03-12",
      quote: undefined,
      quoteVerified: true,
      stance: "contradicts",
      origin: "Alt News's own reporting",
      factCheck: true,
      url: undefined,
    },
  );
  assert.ok(result.evidence.some((e) => e.stance === "supports"), "a For side");
  assert.ok(result.evidence.some((e) => e.stance === "contradicts"), "an Against side");
  assert.deepEqual(
    result.evidence.map((e) => e.id),
    result.evidence.map((_, i) => `E${i + 1}`),
  );
});

test("replay: Evidence from a blocked domain never appears", async () => {
  const events = await collect(BACHCHAN);
  const result = await resultOf(events);

  assert.ok(!result.evidence.some((e) => e.site.includes("mediamass")));
  assert.ok(!events.some((e) => e.type === "evidence" && e.site.includes("mediamass")));
});

test("replay: an `evidence` event is streamed for each accepted item, before the verdict", async () => {
  const events = await collect(BACHCHAN);
  const result = await resultOf(events);
  const evidenceEvents = events.filter((e) => e.type === "evidence");

  assert.deepEqual(
    evidenceEvents.map((e) => ({ id: e.id, site: e.site, stance: e.stance })),
    result.evidence.map((e) => ({ id: e.id, site: e.site, stance: e.stance })),
  );
  assert.ok(events.indexOf(evidenceEvents.at(-1)!) < events.findIndex((e) => e.type === "verdict"));
});

test("replay: a quote not found on its page is dropped; one whose page can't be fetched is kept as 'quote not verified'", async () => {
  const result = await resultOf(await collect(BACHCHAN));

  assert.ok(!result.evidence.some((e) => e.site === "dailyroundup.example"), "invented quote dropped");
  assert.ok(!result.evidence.some((e) => e.site === "ndtv.com"), "a link that doesn't exist (404) is dropped, not kept unverified");
  const unfetched = result.evidence.find((e) => e.site === "viralnewsnow.example");
  assert.equal(unfetched?.quoteVerified, false);
  assert.ok(result.evidence.filter((e) => e !== unfetched).every((e) => e.quoteVerified));
});

test("replay: 15 sites carrying one ANI line count as 1 Independent source", async () => {
  const result = await resultOf(await collect("RBI is banning ₹500 notes from 1 January, forward to all"));

  assert.equal(result.evidence.length, 15);
  assert.equal(new Set(result.evidence.map((e) => e.site)).size, 15);
  assert.equal(result.independentSources, 1);
});

test("replay: distinct Origins count as distinct Independent sources", async () => {
  const result = await resultOf(await collect(BACHCHAN));

  const origins = new Set(result.evidence.filter((e) => !e.factCheck).map((e) => e.origin));
  assert.equal(result.independentSources, origins.size);
  assert.ok(result.independentSources >= 2);
});

const LAPTOP = "Government is giving free laptops to all students, register today";

test("replay: someone else's Fact-check is shown but is never an Independent source", async () => {
  const events = await collect(LAPTOP);
  const result = await resultOf(events);

  assert.deepEqual(
    result.evidence.map((e) => ({ site: e.site, factCheck: e.factCheck })),
    [{ site: "boomlive.in", factCheck: true }],
  );
  assert.equal(result.independentSources, 0);
});

test("replay: with no Independent source either way the Verdict is Not confirmed yet", async () => {
  const events = await collect(LAPTOP);
  const verdict = events.find((e) => e.type === "verdict");

  assert.equal(verdict?.label, "unconfirmed");
  assert.equal((await resultOf(events)).verdict.label, "unconfirmed");
});

test("replay: a quote whose page writes it with a named HTML entity is kept", async () => {
  const result = await resultOf(await collect(BACHCHAN));

  // altnews.in's page has "Bachchan&rsquo;s", the quote a curly apostrophe.
  const altNews = result.evidence.find((e) => e.site === "altnews.in");
  assert.match(altNews?.quote ?? "", /Bachchan’s death/);
  assert.equal(altNews?.quoteVerified, true);
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

test("replay: the proof page's Verdict has tagged reasoning steps citing Evidence ids, what would change it, and the deciding model", async () => {
  const events = await collect(BACHCHAN);
  const result = await resultOf(events);
  const ids = new Set(result.evidence.map((e) => e.id));

  assert.ok(result.verdict.reasoning.length > 0);
  for (const step of result.verdict.reasoning) {
    assert.match(step.tag, /^(fact|inference|assumption|hypothesis)$/);
    assert.ok(step.text.length > 0);
    assert.ok(step.evidenceIds.every((id) => ids.has(id)));
  }
  assert.ok(result.verdict.reasoning.some((s) => s.evidenceIds.length > 0));
  assert.ok(result.verdict.whatWouldChange.length > 0);
  assert.equal(result.model, "gpt-6-luna");
});

test("replay: a reasoning step citing an unknown Evidence id is dropped", async () => {
  const result = await resultOf(await collect(BACHCHAN));

  // The recorded Verdict has a step citing E99, which this Check never found.
  assert.ok(!result.verdict.reasoning.some((s) => /hospital statement/.test(s.text)));
  assert.ok(result.verdict.reasoning.some((s) => /unsourced post/.test(s.text)), "valid steps are kept");
});

function verdictEvent(events: CheckEvent[]) {
  const verdict = events.find((e) => e.type === "verdict");
  assert.ok(verdict?.type === "verdict");
  return verdict;
}

test("replay: an easy claim never escalates, and a Verdict decided by code names no model", async () => {
  assert.equal(verdictEvent(await collect(BACHCHAN)).escalated, false);

  const byCode = await collect(LAPTOP);
  assert.equal(verdictEvent(byCode).escalated, false);
  assert.equal((await resultOf(byCode)).model, null);
});

test("replay: two disagreeing luna Verdicts trigger one sol Verdict, and the verdict event says it escalated", async () => {
  const events = await collect("RBI is banning ₹500 notes from 1 January, forward to all");

  assert.equal(verdictEvent(events).escalated, true);
  const result = await resultOf(events);
  assert.equal(result.model, "gpt-6-sol");
  assert.equal(result.verdict.label, "false");
});

test("replay: a top-label probability under 0.7 also escalates, and if sol isn't sure either it's Not confirmed yet", async () => {
  const events = await collect("Amitabh Bachchan admitted to hospital in critical condition, pray for him");

  assert.equal(verdictEvent(events).escalated, true);
  assert.equal(verdictEvent(events).label, "unconfirmed");
  const result = await resultOf(events);
  assert.equal(result.model, "gpt-6-sol");
  assert.equal(result.verdict.label, "unconfirmed");
});
