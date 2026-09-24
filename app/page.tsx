import {
  ArrowDownIcon,
  CalendarIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  FileTextIcon,
  HistoryIcon,
  ImageIcon,
  LandmarkIcon,
  LoaderCircleIcon,
  LockIcon,
  MessageSquareIcon,
  NewspaperIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/* The landing page, from the Paper design "TruthAgent Landing — Desktop".
   Layout follows the Aceternity startup template; the orange is swapped for the evergreen
   primary because red and amber belong to Verdicts. */

const DARK_BUTTON =
  "inline-flex items-center justify-center bg-linear-to-b from-[#2a2f2d] to-foreground font-semibold text-white shadow-[0_6px_16px_rgba(16,23,20,0.25)] transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none";

function CheckForward({ className = "" }: { className?: string }) {
  return (
    <Link href="/check" className={`${DARK_BUTTON} rounded-[10px] px-6 py-3.5 text-[15px] ${className}`}>
      Check a forward
    </Link>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden width="26" height="26" viewBox="0 0 36 36" className="shrink-0">
        <rect width="36" height="36" rx="9" fill="var(--primary)" />
        <path d="M10 18.5l5.5 5.5L26 13" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-bold tracking-[-0.02em]">TruthAgent</span>
    </span>
  );
}

/** A section title with one word in the accent colour, like the template's "Scale with NO issues". */
function Title({ before, accent, after, className = "" }: { before?: string; accent: string; after?: string; className?: string }) {
  return (
    <h2 className={`text-center text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl ${className}`}>
      {before} <span className="text-primary">{accent}</span> {after}
    </h2>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="mx-auto mt-4 max-w-2xl text-center text-[17px] leading-[26px] text-muted-foreground">{children}</p>;
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <CheckIcon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-primary" strokeWidth={2.4} />
      <span>{children}</span>
    </li>
  );
}

const NAV = [
  ["How it works", "#how"],
  ["Verdicts", "#verdicts"],
  ["Photo check", "#photo"],
  ["FAQ", "#faq"],
];

const SOURCES = [
  [LandmarkIcon, "Official sites"],
  [NewspaperIcon, "News wires"],
  [CircleCheckIcon, "Fact-checkers"],
  [HistoryIcon, "Wayback Machine"],
  [ImageIcon, "Reverse image search"],
] as const;

const STATS = [
  ["3", "Claims pulled out of one forward and checked one by one"],
  ["5", "Plain answers, including Outdated and Not confirmed yet"],
  ["70%", "Less sure than this? A stronger model takes a second look"],
  ["0", "Made-up links. Every citation comes from a real search result"],
];

const FAQ = [
  [
    "Where does the proof come from?",
    "From pages TruthAgent actually found and read during your Check. Each quote has its link and date, so you can open it yourself. Links can't be made up.",
  ],
  [
    'Why does it say "Not confirmed yet"?',
    "There aren't enough independent sources either way, which is normal while a story is still breaking. A wrong confident answer is worse than an honest one. Check again later with one tap.",
  ],
  [
    "Can it check a photo or a screenshot?",
    "Yes. It reads the words in a screenshot and checks them, and its Photo check finds where a picture first appeared online, so an old photo can't pass as today's news.",
  ],
  [
    "What if the news was true last year?",
    "Then it's Outdated: true at an earlier date, not any more. Every Claim is judged as of a date, today unless you tell it when you got the forward.",
  ],
  ["Is it free? Do I need an account?", "It's free to use and there's no sign-up. Paste a forward and press the button."],
];

const CTA_ICONS = [
  [LockIcon, "left-[23%] top-[6%]"],
  [SearchIcon, "left-1/2 top-[3%] -translate-x-1/2"],
  [FileTextIcon, "right-[23%] top-[6%]"],
  [ShieldIcon, "left-[8%] top-1/2 -translate-y-1/2"],
  [MessageSquareIcon, "right-[8%] top-1/2 -translate-y-1/2"],
  [ImageIcon, "left-[23%] bottom-[6%]"],
  [SendIcon, "left-1/2 bottom-[3%] -translate-x-1/2"],
  [ClockIcon, "right-[23%] bottom-[6%]"],
] as const;

const CARD = "overflow-hidden rounded-[22px] border border-[#e6ece9] bg-[#f7faf8]";

function CardText({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-7 pt-6 pb-7">
      <h3 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="max-w-[520px] text-[15px] leading-[22px] text-muted-foreground">{children}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-col items-center overflow-x-clip">
      {/* Hero */}
      <section className="relative flex h-[900px] w-full flex-col items-center overflow-hidden bg-[radial-gradient(55%_45%_at_0%_100%,#6fae8f_0%,transparent_100%),radial-gradient(55%_45%_at_100%_100%,#6fae8f_0%,transparent_100%),linear-gradient(180deg,#fff_0%,#f4f9f6_45%,#cfe5d9_100%)] px-4 sm:h-[1000px]">
        <div
          aria-hidden
          className="absolute top-[470px] left-1/2 size-[1600px] -translate-x-1/2 rounded-full border border-white/90 bg-[radial-gradient(circle_at_50%_28%,#fff_0%,rgba(255,255,255,0.85)_20%,transparent_44%)]"
        />
        <header className="fixed top-3 z-50 flex h-16 w-[calc(100%-2rem)] max-w-[1000px] items-center justify-between rounded-full bg-white/85 pr-2 pl-5 shadow-[0_8px_30px_rgba(16,23,20,0.08)] backdrop-blur-md sm:top-5 sm:pl-6">
          <Link href="/" aria-label="TruthAgent home" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
            <Logo />
          </Link>
          <nav className="hidden gap-8 text-[15px] text-[#3a4540] md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <Link href="/check" className={`${DARK_BUTTON} rounded-full px-[18px] py-[11px] text-[15px] shadow-none`}>
            Check a forward
          </Link>
        </header>

        <div className="relative flex flex-col items-center gap-7 pt-36 text-center sm:pt-[144px]">
          <h1 className="text-[44px] leading-[1.1] font-bold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[76px] lg:leading-[84px]">
            Check Every <span className="text-primary">Forward</span>
            <br />
            Before You Hit <span className="text-primary">Share</span>
          </h1>
          <p className="max-w-[640px] text-lg leading-7 text-muted-foreground">
            Paste a WhatsApp forward or add a screenshot. TruthAgent searches the web, reads the sources, and gives you a plain answer with the proof underneath.
          </p>
          <CheckForward />
        </div>

        {/* Phone */}
        <div aria-hidden className="relative mt-14 flex h-[520px] w-[340px] shrink-0 rounded-t-[52px] bg-foreground px-3 pt-3 shadow-[0_30px_80px_rgba(16,23,20,0.25)] sm:w-[380px]">
          <div className="flex w-full flex-col gap-4 overflow-hidden rounded-t-[42px] bg-white px-5 pt-[18px] text-left">
            <div className="flex items-center justify-between px-2 text-[15px] font-semibold">
              <span>9:41</span>
              <svg width="64" height="12" viewBox="0 0 64 12" fill="currentColor">
                <rect x="0" y="7" width="3" height="5" rx="1" />
                <rect x="5" y="5" width="3" height="7" rx="1" />
                <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
                <rect x="36" y="0.5" width="24" height="11" rx="3" fill="none" stroke="currentColor" />
                <rect x="38" y="2.5" width="18" height="7" rx="1.5" />
                <rect x="61" y="4" width="2" height="4" rx="1" />
              </svg>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-semibold">Your check</span>
              <span className="text-sm text-muted-foreground">2 claims</span>
            </div>
            <p className="w-[270px] self-end rounded-[16px_16px_4px_16px] bg-accent px-3.5 py-3 text-sm leading-5 text-accent-foreground">
              Forwarded many times: RBI will stop ₹500 notes from 1 October. Banks open Sunday to exchange them!
            </p>
            <div className="flex flex-col gap-2.5 rounded-2xl bg-false-soft p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-false px-2.5 py-1 text-[13px] font-bold text-white">False</span>
                <span className="text-[13px] text-muted-foreground">92% sure</span>
              </div>
              <span className="text-[15px] leading-[21px] font-semibold">No official notice says ₹500 notes are being stopped.</span>
              <span className="text-[13px] text-muted-foreground">4 independent sources</span>
            </div>
            <div className="flex flex-col gap-2.5 rounded-2xl bg-pending-soft p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-pending px-2.5 py-1 text-[13px] font-bold text-white">Not confirmed yet</span>
                <span className="text-[13px] text-muted-foreground">Claim 2 of 2</span>
              </div>
              <span className="text-[15px] leading-[21px] font-semibold">Banks will open on Sunday for exchange.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sources strip */}
      <section className="flex flex-col items-center gap-8 px-4 pt-[88px] pb-10">
        <p className="text-xl font-medium text-[#3a4540]">Reads the sources that own the facts</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-14 gap-y-5 text-[19px] font-bold tracking-[-0.01em]">
          {SOURCES.map(([Icon, label]) => (
            <li key={label} className="flex items-center gap-2.5">
              <Icon aria-hidden className="size-[26px]" strokeWidth={2} />
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* Stats */}
      <section className="w-full max-w-[1232px] px-4 pt-20 pb-10">
        <Title before="Proof, Not" accent="Vibes" />
        <Lead>Every answer shows its working: the quotes, the links, and how sure we are.</Lead>
        <ul className="grid gap-5 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(([value, label]) => (
            <li key={value} className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-linear-to-b from-white to-[#f7faf8] p-7">
              <span className="text-[44px] leading-none font-bold tracking-[-0.03em]">{value}</span>
              <span className="text-base leading-[23px] text-muted-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Bento */}
      <section id="how" className="w-full max-w-[1232px] scroll-mt-24 px-4 pt-[120px] pb-10">
        <h2 className="text-center text-4xl font-bold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[64px]">
          Checks Like a Careful <span className="text-primary">Reporter</span>
        </h2>
        <Lead>Four habits that keep a viral forward from fooling it, and fooling you.</Lead>
        <div className="grid gap-5 pt-12 lg:grid-cols-3 lg:grid-rows-[470px_470px]">
          <article className={`${CARD} flex flex-col lg:col-span-2`}>
            <div aria-hidden className="flex flex-1 items-center justify-center gap-4 bg-secondary px-6 py-10 sm:gap-10">
              <div className="flex flex-col items-start gap-2.5 text-[13px]">
                {["dailynews.in", "cityherald.com", "morningpost.in"].map((site) => (
                  <span key={site} className="rounded-lg border border-border bg-white px-3 py-1.5 text-muted-foreground">
                    {site}
                  </span>
                ))}
                <span className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-foreground">+ 12 more copies</span>
              </div>
              <svg width="90" height="140" viewBox="0 0 90 140" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="4 4" className="hidden shrink-0 sm:block">
                <path d="M0 15 C50 15 40 70 90 70M0 53 C50 53 40 70 90 70M0 91 C50 91 40 70 90 70M0 127 C50 127 40 70 90 70" />
              </svg>
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-foreground px-6 py-5 text-white shadow-[0_14px_30px_rgba(16,23,20,0.25)]">
                <span className="text-xs font-semibold tracking-[0.1em] text-[#9fc3b1]">ORIGIN</span>
                <span className="text-xl font-bold">One wire report</span>
                <span className="text-[13px] text-[#c9d5cf]">counts as 1 source</span>
              </div>
            </div>
            <CardText title="Counts sources, not websites">
              Fifteen sites copying one news-wire line are one source. TruthAgent traces each quote back to where it came from.
            </CardText>
          </article>

          <article id="photo" className={`${CARD} flex scroll-mt-24 flex-col`}>
            <div aria-hidden className="flex flex-1 items-center justify-center p-7">
              <div className="relative flex w-[290px] flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-[0_12px_30px_rgba(16,23,20,0.1)]">
                <div className="h-[150px] rounded-[10px] bg-linear-135 from-[#cfe5d9] via-[#7fb89c] to-primary" />
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">First seen online</span>
                  <span className="font-semibold">March 2019</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Shared as</span>
                  <span className="font-semibold">&ldquo;Floods today&rdquo;</span>
                </div>
                <span className="absolute top-[120px] -right-4 rounded-full bg-foreground px-3 py-[7px] text-[13px] font-semibold text-white">Old photo, new story</span>
              </div>
            </div>
            <CardText title="Photo check">Finds where a photo first appeared, so an old picture can&apos;t pass as today&apos;s news.</CardText>
          </article>

          <article className={`${CARD} flex flex-col`}>
            <div aria-hidden className="relative h-[280px] overflow-hidden lg:h-auto lg:flex-1">
              <div className="absolute -top-[150px] -left-10 size-[460px] rounded-full bg-[radial-gradient(circle,#f7faf8_0_22%,#9fc3b1_22%_34%,#f7faf8_34%_48%,#cfe5d9_48%_62%,#f7faf8_62%_76%,#e3efe9_76%_100%)]" />
              <div className="absolute top-10 left-[150px] flex size-20 items-center justify-center rounded-[22px] bg-primary shadow-[0_10px_24px_rgba(30,91,69,0.35)]">
                <CalendarIcon className="size-9 text-white" strokeWidth={2} />
              </div>
              <span className="absolute top-[200px] left-7 rounded-full border border-border bg-white px-3 py-1.5 text-[13px] font-semibold">True in 2016</span>
              <span className="absolute top-[236px] left-[200px] rounded-full bg-pending px-3 py-1.5 text-[13px] font-bold text-white">Outdated today</span>
            </div>
            <CardText title="Right as of the right date">
              Old news reshared as new gets its own label: Outdated. Set the date you got the forward.
            </CardText>
          </article>

          <article className={`${CARD} flex flex-col lg:col-span-2`}>
            <div aria-hidden className="flex flex-1 px-7 pt-7">
              <div className="grid flex-1 gap-4 rounded-t-2xl bg-white p-5 shadow-[0_10px_30px_rgba(16,23,20,0.08)] sm:grid-cols-2">
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-bold tracking-[0.08em] text-primary">FOR</span>
                  <Quote tone="bg-accent" text="Notes will be phased out over the coming months." source="Unnamed blog · 2 Sep" />
                </div>
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-bold tracking-[0.08em] text-false">AGAINST</span>
                  <Quote tone="bg-false-soft" text="₹500 notes continue to be legal tender." source="Official notice · 5 Sep" />
                  <Quote tone="bg-false-soft" text="No circular about ₹500 notes has been issued." source="News wire report · 6 Sep" />
                </div>
              </div>
            </div>
            <div className="border-t border-[#e6ece9]">
              <CardText title="Both sides, side by side">
                Every quote with its link and date, sorted into For and Against. Judge the proof yourself.
              </CardText>
            </div>
          </article>
        </div>
      </section>

      {/* Everyday features */}
      <section className="w-full max-w-[1232px] px-4 pt-[120px] pb-10">
        <Title before="Made for How" accent="Forwards" after="Travel" />
        <Lead>Most rumours arrive as a screenshot in a family group at 7am. TruthAgent is built for exactly that.</Lead>
        <div className="grid gap-6 pt-12 md:grid-cols-3">
          <SmallCard title="Watch it work" text="Every search and every page read shows up live, so you see how the answer was reached.">
            <div className="flex h-full flex-col justify-center gap-2.5 p-5 text-sm">
              {["Found 2 claims and 1 opinion", "Searched official notices", "Read 6 pages, 4 independent"].map((step) => (
                <span key={step} className="flex items-center gap-2.5">
                  <CheckIcon className="size-[18px] text-primary" strokeWidth={2.4} />
                  {step}
                </span>
              ))}
              <span className="flex items-center gap-2.5 rounded-[10px] bg-accent px-3 py-2.5 font-semibold text-accent-foreground">
                <LoaderCircleIcon className="size-[18px] animate-spin text-primary motion-reduce:animate-none" strokeWidth={2.4} />
                Weighing both sides…
              </span>
            </div>
          </SmallCard>
          <SmallCard title="Screenshots welcome" text="Drop in a screenshot of a headline or tweet. It reads the words and checks them.">
            <div className="relative flex h-full items-center justify-center">
              <div className="flex h-60 w-[200px] -rotate-4 flex-col gap-2.5 rounded-[14px] bg-foreground p-4">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#9fc3b1]">BREAKING</span>
                <span className="text-[17px] leading-[22px] font-bold text-white">Schools shut for two weeks from Monday</span>
                <div className="flex-1 rounded-lg bg-linear-135 from-[#2a3a33] to-primary" />
              </div>
              <span className="absolute right-7 bottom-9 rounded-full border border-[#9fc3b1] bg-accent px-3 py-[7px] text-[13px] font-semibold text-accent-foreground">
                Text read from image
              </span>
            </div>
          </SmallCard>
          <SmallCard title="Check again later" text="Breaking news moves fast. One tap re-checks a story once more sources are in.">
            <div className="flex h-full flex-col justify-center gap-3.5 p-5">
              <Recheck label="Not confirmed yet" labelTone="bg-pending-soft text-pending" time="9:05 am" />
              <ArrowDownIcon className="size-5 self-center text-muted-foreground" />
              <Recheck label="True" labelTone="bg-true text-white" time="1:40 pm" boxTone="border-[#9fc3b1] bg-[#f4f9f6]" />
            </div>
          </SmallCard>
        </div>
      </section>

      {/* Verdicts, in the template's pricing slot */}
      <section id="verdicts" className="w-full max-w-[1232px] scroll-mt-24 px-4 pt-[120px] pb-10">
        <Title accent="Honest" after="Answers, Not Just True or False" />
        <Lead>Real forwards are messy. So every Claim gets one of five plain labels, and we&apos;d rather say &ldquo;not yet&rdquo; than guess.</Lead>
        <div className="grid items-end gap-7 pt-14 lg:grid-cols-3">
          <VerdictCard pill="Clear cut">
            <p className="text-[40px] leading-[44px] font-bold tracking-[-0.03em]">
              <span className="text-true">True</span> <span className="text-[26px] font-normal text-[#9aa5a0]">/</span> <span className="text-false">False</span>
            </p>
            <Ticks items={["True: independent sources agree", "False: the core of it was never true", "How sure we are, in plain words"]} />
          </VerdictCard>
          <div className="rounded-[30px] bg-linear-to-b from-[#2f7a5d] to-primary p-2 shadow-[0_26px_60px_rgba(30,91,69,0.35)]">
            <div className="flex flex-col gap-[22px] rounded-3xl bg-[#f7faf8] px-7 pt-8 pb-10">
              <Pill>Developing story</Pill>
              <p className="text-[40px] leading-[44px] font-bold tracking-[-0.03em] text-pending">Not confirmed yet</p>
              <CheckForward className="w-full rounded-xl py-3.5" />
              <hr className="border-border" />
              <Ticks
                items={[
                  "Not enough independent sources yet",
                  "The honest answer while news breaks",
                  "A wrong confident answer is worse",
                  "Re-check in one tap when more is known",
                ]}
              />
            </div>
          </div>
          <VerdictCard pill="Half the story">
            <p className="flex flex-col text-4xl leading-10 font-bold tracking-[-0.03em]">
              <span className="text-false">Misleading</span>
              <span className="text-pending">Outdated</span>
            </p>
            <Ticks items={["Misleading: facts right, framing wrong", "Outdated: true once, not any more", "One line on what's actually going on"]} />
          </VerdictCard>
        </div>
      </section>

      {/* Audience, in the template's testimonials slot */}
      <section className="flex w-full max-w-[1232px] flex-col items-center justify-between gap-16 px-4 pt-[140px] pb-16 lg:flex-row">
        <div className="flex max-w-[520px] flex-col gap-6">
          <h2 className="text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            <span className="text-primary">Made</span> for Everyone
          </h2>
          <p className="text-[19px] leading-[30px] text-[#3a4540]">
            No sign-up, no jargon. If you can forward a message, you can check one. Built to be read on a phone by your parents, not just by researchers.
          </p>
          <ul className="flex flex-col gap-3.5 text-base text-[#3a4540]">
            {["Settle the family group argument, with proof", "Check before you share, not after", "Send the result link back to the group"].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent">
                  <CheckIcon className="size-[13px] text-primary" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link href="/check" className={`${DARK_BUTTON} self-start rounded-full px-[22px] py-[13px] text-[15px]`}>
            Check a forward
          </Link>
        </div>
        <div aria-hidden className="relative h-[560px] w-[520px] max-w-full shrink-0 scale-[0.7] sm:scale-100">
          <Bubble at="left-[230px] top-0" size="size-[120px] text-[34px]" tone="bg-[#cfe5d9] text-primary shadow-[0_14px_30px_rgba(16,23,20,0.12)]">Ma</Bubble>
          <Bubble at="left-[400px] top-[30px]" size="size-[110px] text-[30px]" tone="bg-secondary text-[#9aa5a0]">Pa</Bubble>
          <Bubble at="left-[10px] top-[120px]" size="size-[120px] text-[34px]" tone="bg-secondary text-muted-foreground shadow-[0_14px_30px_rgba(16,23,20,0.1)]">Di</Bubble>
          <div className="absolute top-[210px] left-[200px] flex size-[120px] items-center justify-center rounded-[30px] bg-white shadow-[0_18px_40px_rgba(16,23,20,0.16)]">
            <svg width="54" height="54" viewBox="0 0 36 36">
              <rect width="36" height="36" rx="9" fill="var(--primary)" />
              <path d="M10 18.5l5.5 5.5L26 13" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <Bubble at="left-0 top-[300px]" size="size-[130px] text-4xl" tone="bg-accent text-accent-foreground shadow-[0_14px_30px_rgba(16,23,20,0.12)]">Nani</Bubble>
          <Bubble at="left-[390px] top-[230px]" size="size-[110px] text-[30px]" tone="bg-secondary text-[#9aa5a0]">Bhai</Bubble>
          <Bubble at="left-[220px] top-[420px]" size="size-[130px] text-4xl" tone="bg-primary text-white shadow-[0_18px_40px_rgba(30,91,69,0.3)]">You</Bubble>
          <Bubble at="left-[400px] top-[430px]" size="size-[100px] text-[26px]" tone="bg-[#f3f6f4] text-[#c9d5cf]">+12</Bubble>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="w-full max-w-[912px] scroll-mt-24 px-4 pt-[120px] pb-10">
        <Title before="Frequently" accent="Asked" after="Questions" />
        <Lead>The short answers. Every Check shows the long ones.</Lead>
        <div className="mt-10 flex flex-col gap-3 rounded-3xl bg-[#e4e9e6] p-3">
          {FAQ.map(([question, answer], i) => (
            <details key={question} open={i === 0} className="group rounded-2xl bg-white px-6 py-5 shadow-[0_4px_12px_rgba(16,23,20,0.06)]">
              <summary className="flex cursor-pointer list-none items-center gap-3.5 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                <PlusIcon aria-hidden className="size-[18px] shrink-0 text-primary transition-transform group-open:rotate-45" />
                {question}
              </summary>
              <p className="pt-2.5 pl-8 text-[15px] leading-[23px] text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative flex h-[640px] w-full max-w-[1440px] items-center justify-center px-4">
        {CTA_ICONS.map(([Icon, at], i) => (
          <span key={i} aria-hidden className={`absolute hidden size-[84px] items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(16,23,20,0.14)] sm:flex ${at}`}>
            <Icon className="size-9" strokeWidth={2.2} />
          </span>
        ))}
        <div className="flex flex-col items-center gap-7 rounded-full bg-[radial-gradient(60%_70%_at_50%_50%,#e3efe9_0%,transparent_100%)] px-6 py-20 text-center sm:px-[120px]">
          <h2 className="text-4xl leading-[1.15] font-bold tracking-[-0.035em] sm:text-[56px] sm:leading-[64px]">
            Got a Forward? <span className="text-primary">Check It</span>
            <br />
            Before It Checks <span className="text-primary">You</span>
          </h2>
          <CheckForward />
        </div>
      </section>

      {/* Footer */}
      <footer className="flex w-full flex-col gap-14 rounded-t-[32px] bg-[#f3f6f4] px-6 pt-[72px] pb-10 sm:px-[120px]">
        <div className="flex flex-col justify-between gap-12 lg:flex-row">
          <div className="flex max-w-[380px] flex-col gap-5">
            <Logo />
            <p className="text-2xl leading-8 font-medium tracking-[-0.01em]">Is this forward true? A plain answer, with the proof.</p>
          </div>
          <div className="flex flex-wrap gap-x-24 gap-y-10 text-[15px] text-muted-foreground">
            <FooterColumn title="Product" links={[["Check a forward", "/check"], ["Photo check", "#photo"]]} />
            <FooterColumn title="Learn" links={[["How it works", "#how"], ["The five verdicts", "#verdicts"], ["FAQ", "#faq"]]} />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
          <span>© 2026 TruthAgent</span>
          <span>Built for PS-05 · Binary Hacks 4.0</span>
        </div>
      </footer>
    </div>
  );
}

function Quote({ tone, text, source }: { tone: string; text: string; source: string }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl p-3.5 ${tone}`}>
      <span className="text-sm leading-5">&ldquo;{text}&rdquo;</span>
      <span className="text-xs text-muted-foreground">{source}</span>
    </div>
  );
}

function SmallCard({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-6 rounded-3xl border border-[#e6ece9] bg-[#f3f6f4] px-5 pt-5 pb-7">
      <div aria-hidden className="h-[300px] overflow-hidden rounded-2xl bg-white">
        {children}
      </div>
      <div className="flex flex-col gap-2 px-2">
        <h3 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="text-[15px] leading-[22px] text-muted-foreground">{text}</p>
      </div>
    </article>
  );
}

function Recheck({ label, labelTone, time, boxTone = "border-border" }: { label: string; labelTone: string; time: string; boxTone?: string }) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3.5 ${boxTone}`}>
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${labelTone}`}>{label}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
      <span className="text-sm font-semibold">Bridge closed after the storm</span>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="self-start rounded-full border border-border bg-white px-3.5 py-1.5 text-[15px] font-semibold">{children}</span>;
}

function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3.5 text-[15px] leading-[21px] text-[#3a4540]">
      {items.map((item) => (
        <Tick key={item}>{item}</Tick>
      ))}
    </ul>
  );
}

function VerdictCard({ pill, children }: { pill: string; children: ReactNode }) {
  const [label, list] = Array.isArray(children) ? children : [children, null];
  return (
    <div className="rounded-[28px] bg-[#e4e9e6] p-2 shadow-[0_18px_40px_rgba(16,23,20,0.12)]">
      <div className="flex flex-col gap-[22px] rounded-[22px] bg-[#f7faf8] p-7">
        <Pill>{pill}</Pill>
        {label}
        <hr className="border-border" />
        {list}
      </div>
    </div>
  );
}

function Bubble({ at, size, tone, children }: { at: string; size: string; tone: string; children: ReactNode }) {
  return <div className={`absolute flex items-center justify-center rounded-full font-bold ${at} ${size} ${tone}`}>{children}</div>;
}

function FooterColumn({ title, links }: { title: string; links: string[][] }) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="font-semibold text-foreground">{title}</span>
      {links.map(([label, href]) => (
        <a key={label} href={href} className="hover:text-foreground">
          {label}
        </a>
      ))}
    </div>
  );
}
