import { StepStatusIcon } from "@/components/step-status-icon";
import { getResult } from "@/lib/engine/boundary.ts";
import type { Evidence, ReasoningStep, Result, Tier, VerdictLabel } from "@/lib/engine/schemas.ts";
import { isFactChecker, tierOf } from "@/lib/engine/sources.ts";

const LABEL_TEXT: Record<VerdictLabel, string> = {
  true: "True",
  false: "False",
  misleading: "Misleading",
  unconfirmed: "Not confirmed yet",
};

const LABEL_CLASS: Record<VerdictLabel, string> = {
  true: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300",
  false: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-300",
  misleading: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
  unconfirmed: "bg-muted text-muted-foreground",
};

const CONFIDENCE_TEXT = { high: "High", medium: "Medium", low: "Low" } as const;

const TIER_TEXT: Record<Tier, string> = {
  1: "Official source",
  2: "Fact-checker or major outlet",
  3: "Other site",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Saved Results last 30 days, so a proof page can be asked for one saved before a field
 * existed. What's there is shown; what isn't is worked out from the url or left out. */
type StoredResult = Omit<Result, "verdict" | "evidence" | "independentSources" | "steps"> & {
  verdict: Pick<Result["verdict"], "label" | "oneLine"> & Partial<Result["verdict"]>;
  evidence?: (Partial<Evidence> & { url: string; quote: string })[];
  independentSources?: number;
  steps?: Result["steps"];
};

/** A stance we don't know is the honest answer for older Evidence: it's shown, just not on a side. */
type ShownEvidence = Omit<Evidence, "stance"> & { stance: Evidence["stance"] | null };

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function shownEvidence(stored: StoredResult["evidence"]): ShownEvidence[] {
  return (stored ?? []).map((item, i) => {
    const hostname = hostnameOf(item.url);
    return {
      id: item.id ?? `E${i + 1}`,
      url: item.url,
      site: item.site ?? hostname.replace(/^www\./, ""),
      tier: item.tier ?? tierOf(hostname),
      date: item.date ?? null,
      quote: item.quote,
      quoteVerified: item.quoteVerified !== false,
      stance: item.stance === "supports" || item.stance === "contradicts" ? item.stance : null,
      origin: item.origin ?? null,
      factCheck: item.factCheck ?? isFactChecker(hostname),
    };
  });
}

const TAG_TEXT: Record<ReasoningStep["tag"], string> = {
  fact: "Fact",
  inference: "Inference",
  assumption: "Assumption",
  hypothesis: "Hypothesis",
};

/** Which model decided, in words; a null model means code decided (no Independent source either way). */
function decidedBy({ verdict, model }: StoredResult): string {
  if (model === null) return "Decided by rule: no Independent source either way.";
  if (!verdict.escalated) return `Decided by ${model}.`;
  const why = "the quick verdicts disagreed or weren't sure, or Independent sources disagreed";
  return verdict.label === "unconfirmed"
    ? `A hard claim (${why}), and ${model}, the stronger model, wasn't sure either, so it isn't confirmed yet.`
    : `Decided by ${model}, the stronger model: ${why}.`;
}

function EvidenceColumn({ title, items }: { title: string; items: ShownEvidence[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing found.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} id={item.id} className="scroll-mt-4 rounded-lg border border-border p-3">
              <p className="text-sm text-foreground">
                <span className="mr-2 text-xs font-medium text-muted-foreground">{item.id}</span>
                &ldquo;{item.quote}&rdquo;
              </p>
              {!item.quoteVerified && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Quote not verified</p>
              )}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-sm font-medium text-primary underline underline-offset-4"
              >
                {item.site}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {TIER_TEXT[item.tier]} · {item.date ? DAY_FORMAT.format(new Date(item.date)) : "No date found"}
              </p>
              <p className="text-xs text-muted-foreground">Origin: {item.origin ?? "not identified"}</p>
              {item.factCheck && (
                <p className="text-xs text-muted-foreground">
                  Someone else&apos;s fact-check: a lead, not an Independent source
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result: StoredResult | null = await getResult(id);

  if (!result) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <p className="text-muted-foreground">
          We couldn&apos;t find that Result. It may have expired, or the link is wrong.
        </p>
      </main>
    );
  }

  // Results saved before agent steps existed (issue #3) have none.
  const steps = result.steps ?? [];
  const evidence = shownEvidence(result.evidence);
  const unsorted = evidence.filter((e) => e.stance === null);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <span
        className={`inline-flex w-fit items-center rounded-full px-4 py-1.5 text-lg font-semibold ${LABEL_CLASS[result.verdict.label]}`}
      >
        {LABEL_TEXT[result.verdict.label]}
      </span>

      <p className="text-lg text-foreground">{result.verdict.oneLine}</p>

      {/* Results saved before issue #8 have no Confidence. */}
      {result.verdict.confidence && (
        <p className="text-sm text-foreground">
          <span className="font-medium">{CONFIDENCE_TEXT[result.verdict.confidence.level]} confidence</span>
          <span className="text-muted-foreground"> · {result.verdict.confidence.reason}</span>
        </p>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Main claim</h2>
        <p className="mt-1 text-foreground">{result.mainClaim.original}</p>
      </section>

      {/* Results saved before issue #7 have no reasoning, and their `model` wasn't the deciding one. */}
      {result.verdict.reasoning && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Why</h2>
          {result.verdict.reasoning.length > 0 && (
            <ol className="flex flex-col gap-2">
              {result.verdict.reasoning.map((step, i) => (
                <li key={i} className="text-sm text-foreground">
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {TAG_TEXT[step.tag]}
                  </span>
                  {step.text}
                  {step.evidenceIds.length > 0 && (
                    <span className="text-muted-foreground">
                      {" ("}
                      {step.evidenceIds.map((evidenceId, j) => (
                        <span key={evidenceId}>
                          {j > 0 && ", "}
                          <a href={`#${evidenceId}`} className="underline underline-offset-2">
                            {evidenceId}
                          </a>
                        </span>
                      ))}
                      )
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {result.verdict.whatWouldChange && (
            <p className="text-sm text-foreground">
              <span className="font-medium">What would change this: </span>
              {result.verdict.whatWouldChange}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{decidedBy(result)}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Evidence</h2>
        {result.independentSources !== undefined && (
          <p className="text-sm text-foreground">
            {result.independentSources === 1 ? "1 Independent source" : `${result.independentSources} Independent sources`}
            <span className="text-muted-foreground"> (sites repeating one report count once)</span>
          </p>
        )}
        <div className="grid gap-6 sm:grid-cols-2">
          <EvidenceColumn title="For the claim" items={evidence.filter((e) => e.stance === "supports")} />
          <EvidenceColumn title="Against the claim" items={evidence.filter((e) => e.stance === "contradicts")} />
        </div>
        {unsorted.length > 0 && <EvidenceColumn title="Other evidence" items={unsorted} />}
      </section>

      {steps.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">What TruthAgent did</h2>
          <ol className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2">
                <StepStatusIcon status={step.status} />
                <span>{step.line}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
