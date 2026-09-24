// The accuracy run (#15): every Claim in lib/accuracy/claims.json through check() against the LIVE
// APIs, with fact-checking sites blocked so the Engine can't copy an answer. Prints how many Verdicts
// were right per label and the escalation rate. Costs real money (about $0.50-1 for the full set):
//   npm run accuracy                       the full set
//   npm run accuracy -- --only=id1,id2     just those Claims (ids from claims.json)
import { readFileSync } from "node:fs";
import { liveWorld, type World } from "../lib/engine/boundary.ts";
import { check } from "../lib/engine/check.ts";
import { independentSources } from "../lib/engine/confidence.ts";
import type { Result, VerdictLabel } from "../lib/engine/schemas.ts";
import { blockFactCheckers } from "../lib/engine/sources.ts";
import { summarize, type AccuracyClaim, type Outcome } from "../lib/accuracy/score.ts";

const CONCURRENCY = 3;

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set (put it in .env.local).");
  process.exit(1);
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",");
const all: AccuracyClaim[] = JSON.parse(readFileSync(new URL("../lib/accuracy/claims.json", import.meta.url), "utf-8"));
const claims = only ? all.filter((c) => only.includes(c.id)) : all;
if (only && claims.length !== only.length) {
  console.error(`Unknown id in --only. Known: ${all.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

blockFactCheckers();

// Live OpenAI and page reads, but nothing kept: no Redis needed, no limit counted, and no answer cached
// for a real user that was worked out with fact-checkers blocked.
const results = new Map<string, Result>();
const world: World = {
  ...liveWorld,
  count: async () => 1,
  uncount: async () => {},
  getKey: async () => null,
  setKey: async () => true,
  deleteKey: async () => {},
  saveResult: async (result) => void results.set(result.id, result),
  getResult: async (id) => results.get(id) ?? null,
};

async function run(claim: AccuracyClaim): Promise<Outcome & { seconds: number; detail: string }> {
  const started = Date.now();
  let got: VerdictLabel | "error" = "error";
  let escalated = false;
  let detail = "no Verdict";
  for await (const event of check(claim.claim, { claimDate: claim.claimDate, world })) {
    if (event.type === "verdict") ({ label: got, escalated } = event);
    if (event.type === "error") detail = event.message;
    if (event.type === "done") {
      const saved = results.get(event.id);
      if (saved?.verdict) {
        detail =
          `${saved.evidence.length} Evidence, ${independentSources(saved.evidence)} Independent sources, ` +
          `${saved.verdict.confidence.level} confidence, ${saved.verdict.trigger ?? "easy claim"}`;
      }
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${got === claim.expected ? "✔" : "✘"} ${claim.id}: expected ${claim.expected}, got ${got} (${seconds}s)`);
  return { claim, got, escalated, seconds, detail };
}

console.log(`Running ${claims.length} live Checks (${CONCURRENCY} at a time), fact-checking sites blocked.\n`);
const outcomes: Awaited<ReturnType<typeof run>>[] = new Array(claims.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, claims.length) }, async () => {
    while (next < claims.length) {
      const i = next++;
      outcomes[i] = await run(claims[i]);
    }
  }),
);

const summary = summarize(outcomes);
const percent = (right: number, total: number) => `${right}/${total} (${Math.round((100 * right) / total)}%)`;
console.log("\nWrong or missing:");
for (const o of outcomes.filter((o) => o.got !== o.claim.expected)) {
  console.log(`  ${o.claim.id}: expected ${o.claim.expected}, got ${o.got}; ${o.detail}`);
}
console.log("\nRight per expected label:");
for (const [label, { right, total }] of Object.entries(summary.byLabel)) console.log(`  ${label.padEnd(11)} ${percent(right, total)}`);
console.log(`  ${"overall".padEnd(11)} ${percent(summary.right, summary.total)}`);
console.log(`\nEscalated to sol: ${Math.round(100 * summary.escalationRate)}% of Checks with a Verdict`);
