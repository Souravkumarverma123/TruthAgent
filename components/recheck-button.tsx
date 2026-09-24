"use client";

import { Button } from "@/components/ui/button";
import { runCheck } from "@/lib/check-stream.ts";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Runs a fresh Check of the Message, skipping the cache, and opens its Result. */
export function RecheckButton({ message }: { message: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRecheck() {
    setRunning(true);
    setError(null);
    const form = new FormData();
    form.append("message", message);
    form.append("recheck", "1");
    for await (const event of runCheck(form)) {
      if (event.type === "step") setLine(event.line);
      else if (event.type === "done") router.push(`/check/${event.id}`);
      else if (event.type === "error") setError(event.message);
    }
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" onClick={onRecheck} disabled={running} className="w-fit">
        {running ? "Checking again…" : "Re-check"}
      </Button>
      {running && line && <p aria-live="polite" className="text-xs text-muted-foreground">{line}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
