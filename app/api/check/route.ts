import { check } from "@/lib/engine/check.ts";
import { ExifSchema, type MessageImage } from "@/lib/engine/schemas.ts";

/** The photo's EXIF, read on the phone before resizing; anything malformed is dropped, not trusted. */
function exifOf(field: FormDataEntryValue | null) {
  if (typeof field !== "string") return null;
  try {
    return ExifSchema.safeParse(JSON.parse(field)).data ?? null;
  } catch {
    return null;
  }
}

// Streams a Check's progress as server-sent events over POST (a GET/EventSource stream can't
// carry an image). Takes multipart form data: `message`, an optional `image` file and its `exif`
// JSON. Events: understood, step, evidence, verdict, done, error.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const text = form?.get("message");
  const message = typeof text === "string" ? text : "";
  const file = form?.get("image");
  // check() rejects a wrong type or an oversized photo with a friendly message.
  const image: MessageImage | undefined =
    file instanceof File ? { bytes: new Uint8Array(await file.arrayBuffer()), exif: exifOf(form!.get("exif")) } : undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of check(message, { image })) {
          const { type, ...data } = event;
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
