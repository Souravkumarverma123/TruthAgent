import type { AgentStep } from "@/lib/engine/schemas.ts";
import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";

/** The running / done / failed marker beside an agent step, live and on the proof page. */
export function StepStatusIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "running") return <LoaderCircleIcon aria-label="Running" className="size-4 shrink-0 animate-spin text-muted-foreground" />;
  if (status === "done") return <CheckIcon aria-label="Done" strokeWidth={2.5} className="size-4 shrink-0 text-primary" />;
  return <XIcon aria-label="Failed" strokeWidth={2.5} className="size-4 shrink-0 text-destructive" />;
}
