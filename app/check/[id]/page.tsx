import { RecheckButton } from "@/components/recheck-button";
import { SiteBar } from "@/components/site-bar";
import { StepStatusIcon } from "@/components/step-status-icon";
import { getResult } from "@/lib/engine/boundary.ts";
import { AGREEING, originsBySide } from "@/lib/engine/confidence.ts";
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
import {
  ArrowUpRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  HistoryIcon,
  HourglassIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

const LABEL_TEXT: Record<VerdictLabel, string> = {
  true: "True",
  false: "False",
  misleading: "Misleading",
  outdated: "Outdated",
  unconfirmed: "Not confirmed yet",
};

/** Each label's icon and what it means (CONTEXT.md), so no label has to be taken on trust. */
const LABEL_MEANING: Record<VerdictLabel, { icon: LucideIcon; definition: string }> = {
  true: { icon: CircleCheckIcon, definition: "The evidence backs the claim." },
  false: { icon: CircleXIcon, definition: "The core of the claim was never true." },
  misleading: { icon: TriangleAlertIcon, definition: "The facts are right, but the framing or conclusion is wrong." },
  outdated: { icon: HistoryIcon, definition: "It was true at an earlier date, but isn't any more as of the date checked." },
  unconfirmed: { icon: HourglassIcon, definition: "Not enough independent sources either way yet." },
};

/** The ruling band's field and ink: red and amber appear only here and on state marks. */
const LABEL_TONE: Record<VerdictLabel, { band: string; word: string }> = {
  true: { band: "bg-true-soft", word: "text-true" },
  false: { band: "bg-false-soft", word: "text-false" },
  misleading: { band: "bg-muted", word: "text-foreground" },
  outdated: { band: "bg-muted", word: "text-foreground" },
  unconfirmed: { band: "bg-pending-soft", word: "text-pending" },
};

const CONFIDENCE_TEXT: Record<Confidence["level"], string> = { high: "High", medium: "Medium", low: "Low" };
const CONFIDENCE_STEPS: Record<Confidence["level"], number> = { low: 1, medium: 2, high: 3 };

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
const REAL_TONE: Record<PhotoCheck["real"], string> = { yes: "text-true", no: "text-false", unknown: "text-pending" };

/** Section heading: the same quiet voice for every part of the proof below the ruling. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold tracking-[-0.025em] text-foreground sm:text-3xl">{children}</h2>;
}

function ConfidenceScale({ confidence }: { confidence: Confidence }) {
  const filled = CONFIDENCE_STEPS[confidence.level];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex gap-1">
          {[1, 2, 3].map((step) => (
            <span key={step} className={`h-2.5 w-7 rounded-full ${step <= filled ? "bg-foreground" : "bg-foreground/15"}`} />
          ))}
        </span>
        <span className="text-lg font-semibold whitespace-nowrap text-foreground">{CONFIDENCE_TEXT[confidence.level]} confidence</span>
      </div>
      <span className="text-lg text-foreground/75">{confidence.reason}</span>
    </div>
  );
}

function PhotoCheckPanel({ photo }: { photo: PhotoCheck }) {
  const { exif } = photo;
  const exifParts = exif && [
    exif.taken && `taken ${exif.taken.replace("T", " ").slice(0, 16)}`,
    exif.camera && `with ${exif.camera}`,
    exif.place && `at ${exif.place.lat.toFixed(4)}, ${exif.place.lon.toFixed(4)}`,
  ].filter(Boolean);
  return (
    <section aria-labelledby="photo-check" className="grid gap-6 border-t border-border pt-10 md:grid-cols-[14rem_1fr] md:gap-10">
      <SectionTitle>
        <span id="photo-check">Photo check</span>
      </SectionTitle>
      <div className="flex max-w-3xl flex-col gap-3 text-lg text-foreground">
        <p className={`text-3xl font-bold tracking-[-0.03em] ${REAL_TONE[photo.real]}`}>Real photo: {REAL_TEXT[photo.real]}.</p>
        <p>{photo.reason}</p>
        {photo.description && <p className="text-muted-foreground">The photo shows: {photo.description}</p>}
        <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-4 text-base sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">Earliest copy we found:</dt>
          <dd>
            {photo.earliest ? (
              <>
                <a href={photo.earliest.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
                  {photo.earliest.site}
                </a>
                , <span className="font-mono tracking-[-0.02em] tabular-nums">{DAY_FORMAT.format(new Date(photo.earliest.date))}</span>
              </>
            ) : (
              "none with a date"
            )}
          </dd>
          <dt className="font-semibold">From the photo file:</dt>
          <dd>{exifParts?.length ? exifParts.join(", ") : "no details (most apps remove them, so this proves nothing)"}</dd>
        </dl>
      </div>
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

function EvidenceRow({ item }: { item: Evidence }) {
  return (
    <li id={item.id} className="evidence-row flex flex-col gap-3 py-5">
      <p className="flex gap-3 text-lg leading-relaxed text-foreground">
        <span className="mt-0.5 w-9 shrink-0 font-mono text-base font-medium text-muted-foreground">{item.id}</span>
        <span>&ldquo;{item.quote}&rdquo;</span>
      </p>
      <div className="flex flex-col gap-1.5 pl-12">
        {!item.quoteVerified && <p className="text-base font-semibold text-pending">Quote not verified</p>}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-base font-semibold text-primary underline decoration-primary/40 hover:decoration-primary"
        >
          {item.site}
          <ArrowUpRightIcon aria-hidden className="size-4" />
        </a>
        <p className="text-base text-muted-foreground">
          {TIER_TEXT[item.tier]} · <span className="font-mono tracking-[-0.02em] tabular-nums">{item.date ? DAY_FORMAT.format(new Date(item.date)) : "No date found"}</span>
        </p>
        <p className="text-base text-muted-foreground">Origin: {item.origin ?? "not identified"}</p>
        {item.factCheck && <p className="text-base text-muted-foreground">Someone else&apos;s fact-check: a lead, not an Independent source</p>}
      </div>
    </li>
  );
}

/** One side of the ledger; the side the Verdict rests on takes the Verdict's colour on its rule. */
function LedgerColumn({ title, items, sources, backs }: { title: string; items: Evidence[]; sources: number; backs: string | null }) {
  return (
    <section className="flex flex-col">
      <div className={`flex flex-col gap-1 border-b-2 pb-3 ${backs ?? "border-foreground"}`}>
        <h3 className="flex items-baseline justify-between gap-4 text-xl font-bold tracking-[-0.015em] text-foreground">
          {title}
          <span className="font-mono text-base font-medium text-muted-foreground">({items.length})</span>
        </h3>
        <p className="font-mono text-base tracking-[-0.02em] text-muted-foreground">
          {sources === 1 ? "1 Independent source" : `${sources} Independent sources`}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="py-5 text-lg text-muted-foreground">Nothing found.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <EvidenceRow key={item.id} item={item} />
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
      <>
        <SiteBar />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start gap-6 px-5 py-20 sm:px-10">
          <p className="max-w-2xl text-2xl text-foreground">We couldn&apos;t find that Result. It may have expired, or the link is wrong.</p>
          <Link href="/check" className="text-lg font-semibold text-primary underline">
            Check a forward
          </Link>
        </main>
      </>
    );
  }

  const { verdict, mainClaim, photoCheck, evidence, steps } = result;
  const sides = originsBySide(evidence);
  const sources = sides.total;
  // The side the Verdict rests on; Not confirmed yet rests on neither.
  const backing = verdict && verdict.label !== "unconfirmed" ? AGREEING[verdict.label] : null;
  const backRule = verdict ? (verdict.label === "true" ? "border-true" : "border-false") : null;
  const tone = verdict ? LABEL_TONE[verdict.label] : null;
  const LabelIcon = verdict && LABEL_MEANING[verdict.label].icon;
  // A Claim date on the day of the Check is the default, so Re-check judges as of its own today instead.
  // ponytail: createdAt's day is UTC's, so a Check made just after midnight in India looks like a chosen
  // date and Re-check keeps it; save whether the date was chosen if that confuses anyone.
  const chosenClaimDate = result.claimDate !== result.createdAt.slice(0, 10) ? result.claimDate : undefined;

  return (
    <>
      <SiteBar>
        {/* A photo isn't saved with the Result, so a Check with one can't be re-run from here. */}
        <div className="flex items-center gap-4 text-right">
          <p className="hidden text-base text-muted-foreground sm:block">Checked {ago(result.createdAt)}</p>
          {photoCheck ? (
            <p className="max-w-72 text-base text-muted-foreground">
              To check it again, add the photo on the{" "}
              <Link href="/check" className="font-medium text-primary underline">
                check page
              </Link>
              .
            </p>
          ) : (
            result.message.text && <RecheckButton message={result.message.text} claimDate={chosenClaimDate} />
          )}
        </div>
      </SiteBar>

      <main className="flex flex-1 flex-col pb-24">
        {verdict && tone && (
          <section aria-label="Verdict" className={`settle ${tone.band}`}>
            <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end lg:gap-12">
              <div className="flex flex-col gap-4">
                <p
                  className={`flex items-center gap-[0.2em] leading-[0.95] font-bold tracking-[-0.04em] text-balance ${tone.word} ${
                    // Only the short words fit their column at full size, beside the icon.
                    verdict.label === "true" || verdict.label === "false" ? "text-[clamp(3.5rem,9vw,6rem)]" : "text-[clamp(3rem,6vw,4.5rem)]"
                  }`}
                >
                  {LabelIcon && <LabelIcon aria-hidden strokeWidth={2.5} className="size-[0.75em] shrink-0" />}
                  {LABEL_TEXT[verdict.label]}
                </p>
                <p className="text-lg text-foreground/75">{LABEL_MEANING[verdict.label].definition}</p>
                {result.claimDate && (
                  <p className="text-lg text-foreground">
                    Judged as of{" "}
                    <span className="font-mono font-medium tracking-[-0.02em] tabular-nums">
                      {DAY_FORMAT.format(new Date(result.claimDate))}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-5 lg:pb-2">
                <p className="text-2xl leading-snug font-medium text-pretty text-foreground sm:text-3xl">{verdict.oneLine}</p>
                <ConfidenceScale confidence={verdict.confidence} />
                <p className="text-base text-foreground/70 sm:hidden">Checked {ago(result.createdAt)}</p>
              </div>
            </div>
          </section>
        )}

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 pt-10 sm:gap-20 sm:px-10 sm:pt-14">
          {!verdict && <p className="text-base text-muted-foreground sm:hidden">Checked {ago(result.createdAt)}</p>}

          {mainClaim ? (
            <section aria-labelledby="main-claim" className="flex flex-col gap-4">
              <SectionTitle>
                <span id="main-claim">Main claim</span>
              </SectionTitle>
              <blockquote className="max-w-4xl text-2xl leading-snug text-pretty text-foreground sm:text-[2rem]">
                &ldquo;{mainClaim.original}&rdquo;
              </blockquote>
            </section>
          ) : (
            <p className="max-w-3xl text-2xl leading-snug text-foreground">
              There&apos;s no text to check with this photo. Paste the message that came with it to check its story too.
            </p>
          )}

          {/* Independent of the Verdict: a real photo can carry a False Claim. */}
          {photoCheck && <PhotoCheckPanel photo={photoCheck} />}

          {verdict && (
            <section aria-labelledby="evidence" className="flex flex-col gap-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                <SectionTitle>
                  <span id="evidence">Evidence</span>
                </SectionTitle>
                <p className="text-lg text-foreground">
                  <span className="font-semibold">{sources === 1 ? "1 Independent source" : `${sources} Independent sources`}</span>
                  <span className="text-muted-foreground"> (sites repeating one report count once)</span>
                </p>
              </div>
              <div className="grid gap-12 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
                <div className="md:pr-10">
                  <LedgerColumn
                    title="For the claim"
                    items={evidence.filter((e) => e.stance === "supports")}
                    sources={sides.supports.size}
                    backs={backing === "supports" ? backRule : null}
                  />
                </div>
                <div className="md:pl-10">
                  <LedgerColumn
                    title="Against the claim"
                    items={evidence.filter((e) => e.stance === "contradicts")}
                    sources={sides.contradicts.size}
                    backs={backing === "contradicts" ? backRule : null}
                  />
                </div>
              </div>
            </section>
          )}

          {verdict && (
            <section aria-labelledby="why" className="grid gap-6 border-t border-border pt-10 md:grid-cols-[14rem_1fr] md:gap-10">
              <SectionTitle>
                <span id="why">Why</span>
              </SectionTitle>
              <div className="flex max-w-3xl flex-col gap-6">
                {verdict.reasoning.length > 0 && (
                  <ol className="flex flex-col gap-4">
                    {verdict.reasoning.map((step, i) => (
                      <li key={i} className="flex flex-col gap-1.5 text-lg leading-relaxed text-foreground sm:flex-row sm:gap-4">
                        <span className="w-fit shrink-0 rounded-md bg-muted px-2 py-0.5 text-base font-semibold text-muted-foreground sm:mt-0.5 sm:w-32 sm:text-center">
                          {TAG_TEXT[step.tag]}
                        </span>
                        <span>
                          {step.text}
                          {step.evidenceIds.length > 0 && (
                            <span className="text-muted-foreground">
                              {" ("}
                              {step.evidenceIds.map((evidenceId, j) => (
                                <span key={evidenceId}>
                                  {j > 0 && ", "}
                                  <a href={`#${evidenceId}`} className="font-mono text-base font-medium text-primary underline">
                                    {evidenceId}
                                  </a>
                                </span>
                              ))}
                              )
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="border-t border-border pt-5 text-lg text-foreground">
                  <span className="font-semibold">What would change this: </span>
                  {verdict.whatWouldChange}
                </p>
                <p className="text-base text-muted-foreground">{decidedBy(verdict)}</p>
              </div>
            </section>
          )}

          {steps.length > 0 && (
            <section aria-labelledby="steps" className="grid gap-6 border-t border-border pt-10 md:grid-cols-[14rem_1fr] md:gap-10">
              <SectionTitle>
                <span id="steps">What TruthAgent did</span>
              </SectionTitle>
              <ol className="flex max-w-3xl flex-col gap-3 text-base text-muted-foreground">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1 flex w-4 shrink-0 justify-center">
                      <StepStatusIcon status={step.status} />
                    </span>
                    <span>{step.line}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
