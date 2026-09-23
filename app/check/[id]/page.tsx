import { getResult } from "@/lib/engine/boundary.ts";
import type { VerdictLabel } from "@/lib/engine/schemas.ts";

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

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
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

      {result.evidence.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Sources</h2>
          <ul className="flex flex-col gap-3">
            {result.evidence.map((item, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm text-foreground">&ldquo;{item.quote}&rdquo;</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-sm font-medium text-primary underline underline-offset-4"
                >
                  {item.site}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
