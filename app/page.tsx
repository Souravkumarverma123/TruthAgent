"use client";

import { StepStatusIcon } from "@/components/step-status-icon";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH, type AgentStep } from "@/lib/engine/schemas.ts";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** A line in the live step list; agent steps update in place by id. */
type Row = { id: string; line: string; status?: AgentStep["status"] };

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onCheck() {
    setRunning(true);
    setError(null);
    setRows([]);
    const upsert = (row: Row) =>
      setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]));

    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const reader = response.body?.getReader();
    if (!reader) {
      setError("Something went wrong while checking this. Please try again.");
      setRunning(false);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const raw of events) {
        const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
        const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!eventLine || !dataLine) continue;
        const type = eventLine.slice("event: ".length);
        const data = JSON.parse(dataLine.slice("data: ".length));

        if (type === "understood") {
          upsert({ id: "understood", line: `Found the claim: "${data.claim.canonicalEn}"` });
        } else if (type === "step") {
          upsert({ id: data.id, line: data.line, status: data.status });
        } else if (type === "evidence") {
          upsert({
            id: `evidence-${data.id}`,
            line: `Kept a quote from ${data.site} (${data.stance === "supports" ? "for" : "against"} the claim)`,
          });
        } else if (type === "verdict") {
          upsert({ id: "verdict", line: "Verdict ready" });
        } else if (type === "done") {
          router.push(`/check/${data.id}`);
        } else if (type === "error") {
          setError(data.message);
          setRunning(false);
        }
      }
    }

    setRunning(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold text-foreground">Is this forward true?</h1>
        <p className="text-muted-foreground">Paste a forwarded message and we&apos;ll check it, with proof.</p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={running}
          placeholder="Paste the forward here…"
          rows={8}
          className="w-full resize-none rounded-lg border border-input bg-background p-3 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <Button onClick={onCheck} disabled={running || message.trim().length === 0} size="lg">
          {running ? "Checking…" : "Check if it's true"}
        </Button>

        {rows.length > 0 && (
          <ul aria-live="polite" className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                {row.status && <StepStatusIcon status={row.status} />}
                <span>{row.line}</span>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </main>
    </div>
  );
}
