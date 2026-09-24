import { RecheckButton } from "@/components/recheck-button";
import { StepStatusIcon } from "@/components/step-status-icon";
import { getResult } from "@/lib/engine/boundary.ts";
import { independentSources } from "@/lib/engine/confidence.ts";
import type {
  Confidence,
  Evidence,
  HardClaimTrigger,
  PhotoCheck,
  ReasoningStep,
  Tier,
  Verdict,
  VerdictLabel,
} from "@/lib/engine/schemas.ts";
import Link from "next/link";

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

const CONFIDENCE_TEXT: Record<Confidence["level"], string> = { high: "High", medium: "Medium", low: "Low" };

const TIER_TEXT: Record<Tier, string> = {
  1: "Official source",
  2: "Fact-checker or major outlet",
  3: "Other site",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const AGO_UNITS = [["day", 24 * 60 * 60], ["hour", 60 * 60], ["minute", 60]] as const;

/** "just now", "5 minutes ago", "yesterday": how old a Result is as the page is opened. */
function ago(createdAt: string): string {
  const seconds = (Date.now() - Date.parse(createdAt)) / 1000;
  const unit = AGO_UNITS.find(([, size]) => seconds >= size);
  if (!unit) return "just now";
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.floor(seconds / unit[1]), unit[0]);
}

const TAG_TEXT: Record<ReasoningStep["tag"], string> = {
  fact: "Fact",
  inference: "Inference",
  assumption: "Assumption",
  hypothesis: "Hypothesis",
};

const REAL_TEXT: Record<PhotoCheck["real"], string> = { yes: "Yes", no: "Probably not", unknown: "Can't tell" };

function PhotoCheckCard({ photo }: { photo: PhotoCheck }) {
  const { exif } = photo;
  const exifParts = exif && [
    exif.taken && `taken ${exif.taken.replace("T", " ").slice(0, 16)}`,
    exif.camera && `with ${exif.camera}`,
    exif.place && `at ${exif.place.lat.toFixed(4)}, ${exif.place.lon.toFixed(4)}`,
  ].filter(Boolean);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Photo check</h2>
      <p className="text-foreground">
        <span className="font-semibold">Real photo: {REAL_TEXT[photo.real]}.</span> {photo.reason}
      </p>
      {photo.description && <p className="text-sm text-muted-foreground">The photo shows: {photo.description}</p>}
      <p className="text-sm text-foreground">
        <span className="font-medium">Earliest copy we found: </span>
        {photo.earliest ? (
          <>
            <a href={photo.earliest.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              {photo.earliest.site}
            </a>
            , {DAY_FORMAT.format(new Date(photo.earliest.date))}
          </>
        ) : (
          "none with a date"
        )}
      </p>
      <p className="text-sm text-foreground">
        <span className="font-medium">From the photo file: </span>
        {exifParts?.length ? exifParts.join(", ") : "no details (most apps remove them, so this proves nothing)"}
      </p>
    </section>
  );
}

const TRIGGER_TEXT: Record<HardClaimTrigger, string> = {
  luna_disagreed: "the two quick verdicts disagreed",
  unsure: "a quick verdict wasn't sure enough",
  sources_disagree: "Independent sources disagree",
};

/** Which model decided and, for a Hard claim, the trigger that fired, in words. */
function decidedBy({ model, trigger, label }: Verdict): string {
  if (model === null) return "Decided by rule: no Independent source either way.";
  if (trigger === null) return `Decided by ${model}.`;
  const why = TRIGGER_TEXT[trigger];
  return label === "unconfirmed"
    ? `A hard claim (${why}), and ${model}, the stronger model, wasn't sure either, so it isn't confirmed yet.`
    : `Decided by ${model}, the stronger model: ${why}.`;
}

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

  const { verdict, mainClaim, photoCheck, evidence, steps } = result;
  const sources = independentSources(evidence);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      {/* A photo isn't saved with the Result, so a Check with one can't be re-run from here. */}
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Checked {ago(result.createdAt)}</p>
        {photoCheck ? (
          <p className="text-xs text-muted-foreground">
            To check it again, add the photo on the{" "}
            <Link href="/" className="underline underline-offset-2">
              home page
            </Link>
            .
          </p>
        ) : (
          result.message.text && <RecheckButton message={result.message.text} />
        )}
      </section>

      {verdict && (
        <>
          <span
            className={`inline-flex w-fit items-center rounded-full px-4 py-1.5 text-lg font-semibold ${LABEL_CLASS[verdict.label]}`}
          >
            {LABEL_TEXT[verdict.label]}
          </span>

          <p className="text-lg text-foreground">{verdict.oneLine}</p>

          <p className="text-sm text-foreground">
            <span className="font-medium">{CONFIDENCE_TEXT[verdict.confidence.level]} confidence</span>
            <span className="text-muted-foreground"> · {verdict.confidence.reason}</span>
          </p>
        </>
      )}

      {/* Independent of the Verdict: a real photo can carry a False Claim. */}
      {photoCheck && <PhotoCheckCard photo={photoCheck} />}

      {mainClaim ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Main claim</h2>
          <p className="mt-1 text-foreground">{mainClaim.original}</p>
        </section>
      ) : (
        <p className="text-foreground">
          There&apos;s no text to check with this photo. Paste the message that came with it to check its story too.
        </p>
      )}

      {verdict && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Why</h2>
          {verdict.reasoning.length > 0 && (
            <ol className="flex flex-col gap-2">
              {verdict.reasoning.map((step, i) => (
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
          <p className="text-sm text-foreground">
            <span className="font-medium">What would change this: </span>
            {verdict.whatWouldChange}
          </p>
          <p className="text-xs text-muted-foreground">{decidedBy(verdict)}</p>
        </section>
      )}

      {verdict && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Evidence</h2>
          <p className="text-sm text-foreground">
            {sources === 1 ? "1 Independent source" : `${sources} Independent sources`}
            <span className="text-muted-foreground"> (sites repeating one report count once)</span>
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <EvidenceColumn title="For the claim" items={evidence.filter((e) => e.stance === "supports")} />
            <EvidenceColumn title="Against the claim" items={evidence.filter((e) => e.stance === "contradicts")} />
          </div>
        </section>
      )}

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
