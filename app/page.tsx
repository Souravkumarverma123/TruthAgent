"use client";

import { SiteBar } from "@/components/site-bar";
import { StepStatusIcon } from "@/components/step-status-icon";
import { runCheck } from "@/lib/check-stream.ts";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  NOT_AN_IMAGE,
  PHOTO_TOO_BIG,
  type AgentStep,
  type Exif,
} from "@/lib/engine/schemas.ts";
import { ArrowUpIcon, CircleAlertIcon, ImageIcon, LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** A line in the live step list; agent steps update in place by id. */
type Row = { id: string; line: string; status?: AgentStep["status"] };

type Photo = { name: string; blob: Blob; exif: Exif | null };

/** Longest side after resizing: plenty for reading a screenshot, quick on mobile data. */
const MAX_SIDE = 1600;

/** The file's own date, camera and place. Read before resizing, which drops them. */
async function readExif(file: File): Promise<Exif | null> {
  try {
    const { default: exifr } = await import("exifr");
    const tags = await exifr.parse(file);
    if (!tags) return null;
    const taken = tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : null;
    const camera = [tags.Make, tags.Model].filter((part) => typeof part === "string").join(" ").trim();
    const place = typeof tags.latitude === "number" && typeof tags.longitude === "number" ? { lat: tags.latitude, lon: tags.longitude } : null;
    // exifr reads the camera's local time as the browser's, so format it back without converting.
    const local = taken && new Date(taken.getTime() - taken.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
    return local || camera || place ? { taken: local || null, camera: camera || null, place } : null;
  } catch {
    return null;
  }
}

/** Scales the photo down to MAX_SIDE as a JPEG; if the browser can't, sends the file as is. */
async function resized(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff"; // a transparent PNG would otherwise turn black
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return (await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85))) ?? file;
  } catch {
    return file;
  }
}

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  // The phone's own today (YYYY-MM-DD), not UTC's.
  const today = new Date().toLocaleDateString("en-CA");
  const [claimDate, setClaimDate] = useState(today);
  /** Bumped on every pick or Remove, so a slow earlier pick finishing late can't replace a newer one. */
  const pick = useRef(0);

  async function onPhoto(file: File | undefined) {
    const current = ++pick.current;
    setError(null);
    setPhoto(null);
    if (!file) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError(NOT_AN_IMAGE);
      return;
    }
    const [exif, blob] = await Promise.all([readExif(file), resized(file)]);
    if (current !== pick.current) return;
    // Only when the browser couldn't resize it, so the original goes up.
    if (blob.size > MAX_IMAGE_BYTES) {
      setError(PHOTO_TOO_BIG);
      return;
    }
    setPhoto({ name: file.name, blob, exif });
  }

  async function onCheck() {
    setRunning(true);
    setError(null);
    setRows([]);
    const upsert = (row: Row) =>
      setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]));

    const form = new FormData();
    form.append("message", message);
    // Always sent, so the Message is judged as of the day the person saw here, not UTC's.
    if (claimDate) form.append("claimDate", claimDate);
    if (photo) {
      form.append("image", photo.blob, photo.name);
      if (photo.exif) form.append("exif", JSON.stringify(photo.exif));
    }
    for await (const event of runCheck(form)) {
      if (event.type === "understood") {
        upsert({
          id: "understood",
          line: event.claim ? `Found the claim: "${event.claim.canonicalEn}"` : "No text to check, so checking the photo only",
        });
      } else if (event.type === "step") {
        upsert({ id: event.id, line: event.line, status: event.status });
      } else if (event.type === "evidence") {
        upsert({
          id: `evidence-${event.id}`,
          line: `Kept a quote from ${event.site} (${event.stance === "supports" ? "for" : "against"} the claim)`,
        });
      } else if (event.type === "verdict") {
        upsert({ id: "verdict", line: "Verdict ready" });
      } else if (event.type === "cache") {
        upsert({ id: "cache", line: "We've checked this before, so here's that answer" });
      } else if (event.type === "done") {
        router.push(`/check/${event.id}`);
      } else if (event.type === "error") {
        setError(event.message);
      }
    }

    setRunning(false);
  }

  const canCheck = !running && (message.trim().length > 0 || photo !== null);

  return (
    <>
      <SiteBar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 pt-10 pb-20 sm:px-6 sm:pt-20 lg:pt-28">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-bold tracking-[-0.04em] text-balance text-foreground">
            Is this forward true?
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Paste a forwarded message or add its photo, and we&apos;ll check it, with proof.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canCheck) onCheck();
            }}
            className="flex flex-col gap-2 rounded-[28px] border-[1.5px] border-input bg-background p-3 shadow-[0_4px_24px_-8px_rgba(16,23,20,0.12)] transition-colors hover:border-foreground/30 has-[textarea:focus-visible]:border-primary has-[textarea:focus-visible]:ring-4 has-[textarea:focus-visible]:ring-primary/15"
          >
            {photo && (
              <span className="mx-2 mt-1 flex h-10 w-fit max-w-full min-w-0 items-center gap-2 rounded-xl bg-muted pr-1 pl-3 text-sm text-foreground">
                <ImageIcon aria-hidden className="size-4 shrink-0 text-primary" />
                <span className="truncate">{photo.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${photo.name}`}
                  onClick={() => {
                    pick.current++;
                    setPhoto(null);
                  }}
                  disabled={running}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
                >
                  <XIcon aria-hidden className="size-4" />
                </button>
              </span>
            )}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter is a new line, like a chat box.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={running}
              placeholder="Paste the forward here…"
              rows={2}
              aria-label="The forward to check"
              className="field-sizing-content max-h-72 min-h-16 w-full resize-none bg-transparent px-3 pt-2 text-lg leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            />

            <div className="flex items-center gap-2">
              <label
                title={photo ? "Change photo" : "Add photo / screenshot"}
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/15"
              >
                <PlusIcon aria-hidden className="size-5" />
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  disabled={running}
                  aria-label={photo ? "Change photo" : "Add photo / screenshot"}
                  onChange={(e) => {
                    onPhoto(e.target.files?.[0]);
                    e.target.value = ""; // so picking the same file again after Remove still fires
                  }}
                  className="sr-only"
                />
              </label>

              <label
                title="When did you get this? We check whether it was true on that day."
                className="flex h-10 items-center rounded-full border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-muted has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/15"
              >
                <span className="sr-only">When did you get this?</span>
                <input
                  type="date"
                  value={claimDate}
                  max={today}
                  onChange={(e) => setClaimDate(e.target.value)}
                  disabled={running}
                  suppressHydrationWarning
                  className="bg-transparent text-foreground outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={!canCheck}
                aria-label="Check if it's true"
                className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground"
              >
                {running ? <LoaderCircleIcon aria-hidden className="size-5 animate-spin" /> : <ArrowUpIcon aria-hidden className="size-5" />}
              </button>
            </div>
          </form>

          {error && (
            <p role="alert" className="flex items-start gap-2 text-lg text-destructive">
              <CircleAlertIcon aria-hidden className="mt-1 size-5 shrink-0" />
              {error}
            </p>
          )}

          {rows.length > 0 && (
            <ol aria-live="polite" className="flex flex-col gap-3 border-t border-border pt-6 text-lg text-foreground/80">
              {rows.map((row) => (
                <li key={row.id} className="step-in flex items-start gap-3">
                  <span className="mt-1.5 flex w-5 shrink-0 justify-center">
                    {row.status ? <StepStatusIcon status={row.status} /> : <span aria-hidden className="mt-1 size-2 rounded-full bg-primary" />}
                  </span>
                  <span>{row.line}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </>
  );
}
