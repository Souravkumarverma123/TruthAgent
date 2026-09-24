"use client";

import { SiteBar } from "@/components/site-bar";
import { StepStatusIcon } from "@/components/step-status-icon";
import { Button } from "@/components/ui/button";
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
import { ArrowRightIcon, CircleAlertIcon, ImagePlusIcon, LoaderCircleIcon } from "lucide-react";
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
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 pt-6 pb-20 sm:px-10 sm:pt-12 lg:pt-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="flex flex-col gap-5 lg:pt-4">
          <h1 className="text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-foreground">
            Is this forward true?
          </h1>
          <p className="max-w-md text-xl leading-relaxed text-muted-foreground sm:text-2xl">
            Paste a forwarded message or add its photo, and we&apos;ll check it, with proof.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={running}
            placeholder="Paste the forward here…"
            rows={7}
            aria-label="The forward to check"
            className="min-h-56 w-full resize-none rounded-3xl border-[1.5px] border-input bg-background p-6 text-xl leading-relaxed text-foreground shadow-[0_1px_2px_rgba(16,23,20,0.04)] transition-colors outline-none placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 disabled:bg-muted/60"
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-input bg-background px-5 text-base font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:border-primary has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/15">
              <ImagePlusIcon aria-hidden className="size-5 text-primary" />
              {photo ? "Change photo" : "Add photo / screenshot"}
              <input
                type="file"
                accept={IMAGE_TYPES.join(",")}
                disabled={running}
                onChange={(e) => {
                  onPhoto(e.target.files?.[0]);
                  e.target.value = ""; // so picking the same file again after Remove still fires
                }}
                className="sr-only"
              />
            </label>
            {photo && (
              <span className="flex h-12 min-w-0 items-center gap-3 rounded-full bg-muted pr-2 pl-5 text-base text-foreground">
                <span className="truncate">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    pick.current++;
                    setPhoto(null);
                  }}
                  disabled={running}
                  className="h-9 shrink-0 rounded-full px-3 text-sm font-semibold text-primary underline underline-offset-2 hover:bg-background disabled:opacity-50"
                >
                  Remove
                </button>
              </span>
            )}
          </div>

          <Button
            onClick={onCheck}
            disabled={!canCheck}
            className="h-16 w-full rounded-2xl text-xl font-semibold shadow-[0_8px_20px_-10px_rgba(30,91,69,0.55)] hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none [&_svg:not([class*='size-'])]:size-5"
          >
            {running ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : null}
            {running ? "Checking…" : "Check if it's true"}
            {running ? null : <ArrowRightIcon aria-hidden />}
          </Button>

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
