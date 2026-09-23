// The autonomous agent loop (docs/architecture.md §5 ⑤): the model picks the
// next tool and decides when it has enough; code runs our tools, enforces the
// limits, and streams every tool call as a `step` event.
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  FunctionTool,
  ResponseInputItem,
  Tool,
  ToolChoiceAllowed,
  ToolChoiceOptions,
  WebSearchTool,
} from "openai/resources/responses/responses";
import { callOpenAI } from "./boundary.ts";
import { agentTurnFixture } from "./fixtures.ts";
import { MODELS } from "./models.ts";
import {
  EvidenceCandidatesSchema,
  type AgentStep,
  type CheckEvent,
  type ClaimType,
  type EvidenceCandidate,
} from "./schemas.ts";
import { AUTHORITY_RULES, BLOCKED_DOMAINS } from "./sources.ts";
import { failedRead, readPage, type Page, type PageRead } from "./tools.ts";

const MAX_STEPS = 8;
const MAX_SEARCHES = 3;
const TOTAL_MS = 60_000;
/** One model turn; the SDK default (10 minutes) would blow the ~60s budget.
 * ponytail: the 60s deadline is checked between turns, so a Check can run to
 * about 60s plus one final turn; abort mid-turn if that's too slow. */
const TURN_MS = 25_000;
/** Enough for the model to find a quote; keeps a turn's tokens small.
 * ponytail: the model sees only a page's first 6,000 chars, so it can't quote
 * deeper; send the part around the claim's keywords if Evidence goes missing. */
const PAGE_TEXT_CHARS = 6_000;

/** One model turn, reduced to what the loop needs. Replay fixtures use this shape. */
export interface AgentTurn {
  responseId: string;
  /** Hosted web searches the model ran during this turn. */
  searches: { query: string; failed: boolean }[];
  /** Our function tools the model wants run. */
  calls: { callId: string; name: string; arguments: string }[];
  /** Set once the model stops calling tools. */
  evidence: EvidenceCandidate[] | null;
}

const READ_PAGE_TOOL: FunctionTool = {
  type: "function",
  name: "read_page",
  description:
    "Read a web page. Returns its text and published date (from the page itself, else the earliest Wayback Machine copy).",
  strict: true,
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "Full http(s) URL of the page" } },
    required: ["url"],
    additionalProperties: false,
  },
};

const WEB_SEARCH_TOOL: WebSearchTool = {
  type: "web_search",
  search_context_size: "low",
  user_location: { type: "approximate", country: "IN" },
  // `blocked_domains` is in the API docs but not yet in the SDK's types.
  filters: { blocked_domains: BLOCKED_DOMAINS } as WebSearchTool.Filters,
};

function instructions(claimType: ClaimType, claimDate: string): string {
  return [
    `Today's date is ${new Date().toISOString().slice(0, 10)}. Judge the Claim as of ${claimDate}.`,
    `Who can settle this kind of Claim: ${AUTHORITY_RULES[claimType]}`,
    `Find Evidence for and against the Claim. Use web_search to find pages (at most ${MAX_SEARCHES} searches) ` +
      "and read_page to read a page before quoting it. Quote only words that appear in the page text.",
    "Also search for denials and retractions, not just the original story.",
    "If a tool returns an error, carry on with other pages or tools.",
    "When you have enough, stop and answer with the Evidence: each item's real url, " +
      "an exact quote, and whether it supports, contradicts, or is irrelevant to the Claim. Never invent a url or a quote.",
  ].join("\n");
}

async function liveTurn(
  client: OpenAI,
  params: {
    instructions: string;
    input: string | ResponseInputItem[];
    previousResponseId: string | undefined;
    toolsAllowed: boolean;
    searchesLeft: number;
  },
): Promise<AgentTurn> {
  const tools: Tool[] = [READ_PAGE_TOOL, WEB_SEARCH_TOOL];
  // Tools stay declared every turn (earlier calls in the conversation reference
  // them); tool_choice narrows what may be called now.
  const toolChoice: ToolChoiceOptions | ToolChoiceAllowed = !params.toolsAllowed
    ? "none"
    : params.searchesLeft > 0
      ? "auto"
      : { type: "allowed_tools", mode: "auto", tools: [{ type: "function", name: "read_page" }] };
  const response = await client.responses.parse(
    {
      model: MODELS.luna,
      instructions: params.instructions,
      input: params.input,
      previous_response_id: params.previousResponseId,
      tools,
      tool_choice: toolChoice,
      // Counts built-in tools only (web search), not read_page.
      max_tool_calls: params.searchesLeft > 0 ? params.searchesLeft : undefined,
      text: { format: zodTextFormat(EvidenceCandidatesSchema, "evidence") },
    },
    { timeout: TURN_MS, maxRetries: 0 },
  );

  const turn: AgentTurn = {
    responseId: response.id,
    searches: [],
    calls: [],
    evidence: response.output_parsed?.evidence ?? null,
  };
  for (const item of response.output) {
    if (item.type === "web_search_call" && item.action.type === "search") {
      const query = (item.action.queries ?? [item.action.query]).filter(Boolean).join("; ");
      turn.searches.push({ query, failed: item.status === "failed" });
    } else if (item.type === "function_call") {
      turn.calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
    }
  }
  return turn;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function dateNote(page: Page): string {
  if (!page.published) return " (no date found)";
  const day = DAY_FORMAT.format(new Date(page.published));
  return page.date_source === "page" ? ` (published ${day})` : ` (earliest archived copy ${day})`;
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "a page";
  }
}

export interface AgentOutcome {
  candidates: EvidenceCandidate[];
  steps: AgentStep[];
  /** Pages read during the loop, by url. Saves the quote check a second fetch. */
  pages: Map<string, PageRead>;
}

/**
 * Runs the agent loop for one Claim: streams a `step` event per tool call and
 * returns the Evidence candidates, the steps as last shown, and the pages read.
 */
export async function* agentLoop(
  claim: { canonicalEn: string; claimType: ClaimType },
  claimDate: string,
): AsyncGenerator<CheckEvent, AgentOutcome> {
  const prompt = instructions(claim.claimType, claimDate);
  const deadline = Date.now() + TOTAL_MS;
  const steps = new Map<string, AgentStep>();
  const pages = new Map<string, PageRead>();
  let searches = 0;
  let input: string | ResponseInputItem[] = `Claim: ${claim.canonicalEn}`;
  let previousResponseId: string | undefined;

  function step(id: string, agentStep: AgentStep): CheckEvent {
    steps.set(id, agentStep);
    return { type: "step", id, ...agentStep };
  }
  const outOfBudget = () => steps.size >= MAX_STEPS || Date.now() >= deadline;

  // Every turn but the last runs at least one step, so MAX_STEPS + 1 turns is the most the loop needs.
  for (let turnIndex = 0; turnIndex <= MAX_STEPS; turnIndex++) {
    const toolsAllowed = !outOfBudget();
    const searchesLeft = toolsAllowed ? Math.min(MAX_SEARCHES - searches, MAX_STEPS - steps.size) : 0;
    const turn = await callOpenAI({
      fixture: agentTurnFixture(claim.canonicalEn, turnIndex),
      live: (client) => liveTurn(client, { instructions: prompt, input, previousResponseId, toolsAllowed, searchesLeft }),
    });

    // Hosted searches already ran inside the model call, so they show as running and done together.
    // ponytail: stream the Responses call to show "Searching…" while it runs, if the wait feels dead.
    for (const search of turn.searches) {
      const id = `s${steps.size + 1}`;
      searches++;
      yield step(id, { tool: "web_search", line: `Searching the web for "${search.query}"…`, status: "running" });
      yield step(
        id,
        search.failed
          ? { tool: "web_search", line: `Web search for "${search.query}" didn't work`, status: "failed" }
          : { tool: "web_search", line: `Searched the web for "${search.query}"`, status: "done" },
      );
    }

    if (turn.calls.length === 0) return { candidates: turn.evidence ?? [], steps: [...steps.values()], pages };

    // Every call needs an output, even ones we don't run, or the next turn is rejected.
    const outputs: ResponseInputItem[] = [];
    for (const call of turn.calls) {
      let output: unknown;
      if (call.name !== "read_page") {
        output = { error: `Unknown tool ${call.name}` };
      } else if (outOfBudget()) {
        output = { error: "Out of steps. Answer with the Evidence you have." };
      } else {
        let url = "";
        try {
          url = String(JSON.parse(call.arguments).url ?? "");
        } catch {}
        const id = `s${steps.size + 1}`;
        const site = siteName(url);
        yield step(id, { tool: "read_page", line: `Reading ${site}…`, status: "running" });
        try {
          const page = await readPage(url);
          pages.set(url, page);
          output = { ...page, text: page.text.slice(0, PAGE_TEXT_CHARS) };
          yield step(id, { tool: "read_page", line: `Read ${site}${dateNote(page)}`, status: "done" });
        } catch (error) {
          pages.set(url, failedRead(error));
          output = { error: `Couldn't read this page: ${error instanceof Error ? error.message : String(error)}` };
          yield step(id, { tool: "read_page", line: `Couldn't read ${site}`, status: "failed" });
        }
      }
      outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
    }
    previousResponseId = turn.responseId;
    input = outputs;
  }
  return { candidates: [], steps: [...steps.values()], pages };
}
