// The accuracy run (#15): every Claim in lib/accuracy/claims.json through check(), with fact-checking
// sites blocked so the Engine can't copy an answer. Prints how many Verdicts were right per label and
// the escalation rate.
//   npm run accuracy                         live: the full set, about $0.50-1. Saves each Claim's outside
//                                            answers as a replay Scenario in .data/accuracy/<id>.scenario.json
//   npm run accuracy -- --reverdict          replays the saved search, pages and Origins, and runs only the
//                                            Verdict live: about 1 cent a run, for tuning the Verdict
//   npm run accuracy -- --only=id1,id2       just those Claims (ids from claims.json), either mode
// Every run writes what each Check saw and decided to .data/accuracy/<id>.last.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { liveWorld, replayWorld, type Ask, type Scenario, type World } from "../lib/engine/boundary.ts";
import { check } from "../lib/engine/check.ts";
import { independentSources } from "../lib/engine/confidence.ts";
import type { AgentTurn, Result, VerdictLabel, VerdictOutput } from "../lib/engine/schemas.ts";
import { blockFactCheckers } from "../lib/engine/sources.ts";
import { summarize, type AccuracyClaim, type Outcome } from "../lib/accuracy/score.ts";

const CONCURRENCY = 3;
const DIR = ".data/accuracy";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set (put it in .env.local).");
  process.exit(1);
}

const reverdict = process.argv.includes("--reverdict");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",");
const all: AccuracyClaim[] = JSON.parse(readFileSync(new URL("../lib/accuracy/claims.json", import.meta.url), "utf-8"));
const claims = only ? all.filter((c) => only.includes(c.id)) : all;
if (only && claims.length !== only.length) {
  console.error(`Unknown id in --only. Known: ${all.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

blockFactCheckers();
mkdirSync(DIR, { recursive: true });
const scenarioPath = (claim: AccuracyClaim) => `${DIR}/${claim.id}.scenario.json`;

/** Keeps a live answer in `scenario`, where replay looks for it. */
function record(scenario: Scenario, ask: Ask, answer: unknown): void {
  if (ask.step === "understand") scenario.understand = answer as Scenario["understand"];
  if (ask.step === "origins") scenario.origins = answer as Scenario["origins"];
  if (ask.step === "agentTurn") (scenario.agentTurns ??= [])[ask.turn] = answer as AgentTurn;
  if (ask.step === "verdict") {
    const verdicts = (scenario.verdicts ??= {});
    if (ask.model === "sol") verdicts.sol = answer as VerdictOutput;
    else ((verdicts.luna ??= [] as unknown as [VerdictOutput, VerdictOutput])[ask.run] = answer as VerdictOutput);
  }
}

/** A page that failed live, as replay's status number: 404 reads back as "not there", 503 as "couldn't reach". */
function failedStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  const code = (error as NodeJS.ErrnoException)?.code;
  const status = /^HTTP (\d+)$/.exec(message)?.[1];
  if (status) return Number(status);
  return code === "ENOTFOUND" || code === "ERR_INVALID_URL" || message === "Not a public web page" ? 404 : 503;
}

/** One Claim's world. Live: real OpenAI and pages, each answer recorded into `recording`. Reverdict: the saved
 * Scenario, except the Verdict, which runs live and is recorded. Either way nothing reaches Redis: no limit
 * counted, and no answer worked out with fact-checkers blocked is cached for a real user. */
function claimWorld(saved: Scenario | null, recording: Scenario, results: Map<string, Result>): World {
  const base = saved ? replayWorld(saved) : liveWorld;
  return {
    ...base,
    async openai(ask, live) {
      const answer = saved && ask.step !== "verdict" ? await base.openai(ask, live) : await liveWorld.openai(ask, live);
      record(recording, ask, answer);
      return answer;
    },
    async fetchText(url, signal) {
      if (saved) return base.fetchText(url, signal);
      try {
        return ((recording.pages ??= {})[url] = await liveWorld.fetchText(url, signal));
      } catch (error) {
        (recording.pages ??= {})[url] = failedStatus(error);
        throw error;
      }
    },
    count: async () => 1,
    uncount: async () => {},
    getKey: async () => null,
    setKey: async () => true,
    deleteKey: async () => {},
    saveResult: async (result) => void results.set(result.id, result),
    getResult: async (id) => results.get(id) ?? null,
  };
}

async function run(claim: AccuracyClaim): Promise<Outcome & { detail: string }> {
  const started = Date.now();
  let saved: Scenario | null = null;
  if (reverdict) {
    try {
      saved = JSON.parse(readFileSync(scenarioPath(claim), "utf-8"));
    } catch {
      console.log(`✘ ${claim.id}: no saved Scenario; run it live first`);
      return { claim, got: "error", escalated: false, detail: "no saved Scenario" };
    }
  }
  const recording: Scenario = {};
  const results = new Map<string, Result>();
  let got: VerdictLabel | "error" = "error";
  let escalated = false;
  let detail = "no Verdict";
  let result: Result | undefined;
  for await (const event of check(claim.claim, { claimDate: claim.claimDate, world: claimWorld(saved, recording, results) })) {
    if (event.type === "verdict") ({ label: got, escalated } = event);
    if (event.type === "error") detail = event.message;
    if (event.type === "done") result = results.get(event.id);
  }
  if (result?.verdict) {
    detail =
      `${result.evidence.length} Evidence, ${independentSources(result.evidence)} Independent sources, ` +
      `${result.verdict.confidence.level} confidence, ${result.verdict.trigger ?? "easy claim"}`;
  }
  if (!saved && got !== "error") writeFileSync(scenarioPath(claim), JSON.stringify(recording));
  writeFileSync(
    `${DIR}/${claim.id}.last.json`,
    JSON.stringify({ expected: claim.expected, got, verdicts: recording.verdicts, result }, null, 2),
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${got === claim.expected ? "✔" : "✘"} ${claim.id}: expected ${claim.expected}, got ${got} (${seconds}s)`);
  return { claim, got, escalated, detail };
}

const mode = reverdict ? "saved Scenarios, live Verdicts" : "live";
console.log(`Running ${claims.length} Checks (${mode}, ${CONCURRENCY} at a time), fact-checking sites blocked.\n`);
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
console.log(`\nRight way (any not-true label for a Claim that isn't true): ${percent(summary.rightWay, summary.total)}`);
console.log(`\nEscalated to sol: ${Math.round(100 * summary.escalationRate)}% of Checks with a Verdict`);
