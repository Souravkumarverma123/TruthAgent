"use client";

import { StepStatusIcon } from "@/components/step-status-icon";
import { Button } from "@/components/ui/button";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  NOT_AN_IMAGE,
  PHOTO_TOO_BIG,
  type AgentStep,
  type Exif,
} from "@/lib/engine/schemas.ts";
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
    const response = await fetch("/api/check", { method: "POST", body: form });

    const reader = response.ok ? response.body?.getReader() : undefined;
    if (!reader) {
      // The host turns away a request body over its limit (Vercel: 4.5 MB) before the Check runs.
      setError(response.status === 413 ? PHOTO_TOO_BIG : "Something went wrong while checking this. Please try again.");
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
          upsert({
            id: "understood",
            line: data.claim ? `Found the claim: "${data.claim.canonicalEn}"` : "No text to check, so checking the photo only",
          });
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
        <p className="text-muted-foreground">Paste a forwarded message or add its photo, and we&apos;ll check it, with proof.</p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={running}
          placeholder="Paste the forward here…"
          rows={8}
          className="w-full resize-none rounded-lg border border-input bg-background p-3 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
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
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {photo.name}
              <button type="button" onClick={() => {
                  pick.current++;
                  setPhoto(null);
                }} disabled={running} className="underline underline-offset-2">
                Remove
              </button>
            </span>
          )}
        </div>

        <Button onClick={onCheck} disabled={running || (message.trim().length === 0 && !photo)} size="lg">
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
