import { cookies } from "next/headers";
import { DEMO_PASS_COOKIE, isDemoPass } from "@/lib/demo-pass.ts";
import { check } from "@/lib/engine/check.ts";
import { ExifSchema, MAX_IMAGE_BYTES, PHOTO_TOO_BIG, type CheckEvent, type MessageImage } from "@/lib/engine/schemas.ts";

/** The photo, up to 2,000 characters of text (4 bytes each at most) and the form's own overhead.
 * A request declaring more is turned away before its body is read into memory. */
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

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
// JSON, and `recheck=1` to skip the cache. Events: understood, step, evidence, verdict, cache, done, error.
export async function POST(request: Request) {
  // ponytail: trusts the declared Content-Length; a chunked request without one is still read in full
  // (Vercel caps any request body at 4.5 MB).
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return sse((async function* (): AsyncGenerator<CheckEvent> {
      yield { type: "error", message: PHOTO_TOO_BIG };
    })());
  }
  const form = await request.formData().catch(() => null);
  const text = form?.get("message");
  const message = typeof text === "string" ? text : "";
  const file = form?.get("image");
  // check() rejects a wrong type or an oversized photo with a friendly message.
  const image: MessageImage | undefined =
    file instanceof File ? { bytes: new Uint8Array(await file.arrayBuffer()), exif: exifOf(form!.get("exif")) } : undefined;
  const demoPass = isDemoPass((await cookies()).get(DEMO_PASS_COOKIE)?.value);
  const recheck = form?.get("recheck") === "1";
  return sse(check(message, { image, ip: clientIp(request), demoPass, recheck }));
}

/** The caller's address as Vercel reports it. ponytail: trusts these headers, which Vercel sets
 * itself; behind another host a client could forge them to dodge the per-person limit. */
function clientIp(request: Request): string | undefined {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim();
}

function sse(events: AsyncIterable<CheckEvent>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of events) {
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
