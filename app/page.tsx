"use client";

import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH } from "@/lib/engine/schemas.ts";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onCheck() {
    setRunning(true);
    setError(null);
    setLines([]);

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
          setLines((prev) => [...prev, `Found the claim: "${data.claim.canonicalEn}"`]);
        } else if (type === "verdict") {
          setLines((prev) => [...prev, `Verdict ready`]);
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

        {lines.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </main>
    </div>
  );
}
