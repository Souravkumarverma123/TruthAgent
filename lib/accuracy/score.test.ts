import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { check } from "../engine/check.ts";
import { replayWorld } from "../engine/boundary.ts";
import { BACHCHAN } from "../engine/scenarios.ts";
import { VERDICT_LABELS } from "../engine/schemas.ts";
import { blockFactCheckers } from "../engine/sources.ts";
import { summarize, type AccuracyClaim, type Outcome } from "./score.ts";

const claims: AccuracyClaim[] = JSON.parse(readFileSync(new URL("./claims.json", import.meta.url), "utf-8"));

test("the accuracy set has about 15 unique Claims with a source, covering every label but Not confirmed yet", () => {
  assert.ok(claims.length >= 15 && claims.length <= 20);
  assert.equal(new Set(claims.map((c) => c.id)).size, claims.length);
  for (const c of claims) {
    assert.ok(VERDICT_LABELS.includes(c.expected) && c.expected !== "unconfirmed", c.id);
    assert.match(c.source.url, /^https:\/\//, c.id);
    assert.ok(!c.claimDate || /^\d{4}-\d{2}-\d{2}$/.test(c.claimDate), c.id);
  }
  for (const label of ["true", "false", "misleading", "outdated"]) {
    assert.ok(claims.some((c) => c.expected === label), label);
  }
});

test("the summary counts right answers per label and the escalation rate among Checks with a Verdict", () => {
  const [falseClaim, trueClaim, outdatedClaim] = ["false-500-march-2026", "true-chandrayaan-3", "outdated-hasina-pm"].map(
    (id) => claims.find((c) => c.id === id)!,
  );
  const outcomes: Outcome[] = [
    { claim: falseClaim, got: "false", escalated: false },
    { claim: trueClaim, got: "misleading", escalated: true },
    { claim: outdatedClaim, got: "error", escalated: false },
  ];
  assert.deepEqual(summarize(outcomes), {
    right: 1,
    total: 3,
    byLabel: { true: { right: 0, total: 1 }, false: { right: 1, total: 1 }, outdated: { right: 0, total: 1 } },
    escalationRate: 0.5,
  });
});

// Its own file, so its own process: blocking changes the list for the rest of the process. It goes in
// through check() the way the accuracy run does, and throws if the list outgrows web_search's limit.
test("with fact-checking sites blocked, their pages never become Evidence", async () => {
  const evidenceSites = async () => {
    const sites: string[] = [];
    for await (const e of check("Amitabh Bachchan has died, forward this to everyone", { world: replayWorld(BACHCHAN) })) {
      if (e.type === "evidence") sites.push(e.site);
    }
    return sites;
  };

  assert.ok((await evidenceSites()).includes("altnews.in"), "Alt News is Evidence in a normal run");
  blockFactCheckers();
  assert.ok(!(await evidenceSites()).includes("altnews.in"));
});
