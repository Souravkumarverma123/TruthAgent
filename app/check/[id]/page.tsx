import { StepStatusIcon } from "@/components/step-status-icon";
import { getResult } from "@/lib/engine/boundary.ts";
import type { Evidence, Tier, VerdictLabel } from "@/lib/engine/schemas.ts";

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

const TIER_TEXT: Record<Tier, string> = {
  1: "Official source",
  2: "Fact-checker or major outlet",
  3: "Other site",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function EvidenceColumn({ title, items }: { title: string; items: Evidence[] }) {
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
            <li key={item.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-foreground">&ldquo;{item.quote}&rdquo;</p>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getResult(id);

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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <span
        className={`inline-flex w-fit items-center rounded-full px-4 py-1.5 text-lg font-semibold ${LABEL_CLASS[result.verdict.label]}`}
      >
        {LABEL_TEXT[result.verdict.label]}
      </span>

      <p className="text-lg text-foreground">{result.verdict.oneLine}</p>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Main claim</h2>
        <p className="mt-1 text-foreground">{result.mainClaim.original}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Evidence</h2>
        <p className="text-sm text-foreground">
          {result.independentSources === 1 ? "1 Independent source" : `${result.independentSources} Independent sources`}
          <span className="text-muted-foreground"> (sites repeating one report count once)</span>
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <EvidenceColumn title="For the claim" items={result.evidence.filter((e) => e.stance === "supports")} />
          <EvidenceColumn title="Against the claim" items={result.evidence.filter((e) => e.stance === "contradicts")} />
        </div>
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
