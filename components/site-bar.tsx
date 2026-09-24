import Link from "next/link";
import type { ReactNode } from "react";

/** The thin bar on every page: the wordmark home on the left, page-specific status on the right. */
export function SiteBar({ children }: { children?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-10 sm:py-7">
      <Link href="/" className="flex items-center gap-2.5 rounded-md text-foreground no-underline focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
        <svg aria-hidden width="28" height="28" viewBox="0 0 36 36" className="shrink-0">
          <rect width="36" height="36" rx="9" fill="var(--primary)" />
          <path d="M10 18.5l5.5 5.5L26 13" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xl font-bold tracking-[-0.02em]">TruthAgent</span>
      </Link>
      {children}
    </header>
  );
}
