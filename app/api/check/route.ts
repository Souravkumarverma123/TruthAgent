import { check } from "@/lib/engine/check.ts";

// Streams a Check's progress as server-sent events over POST (a GET/EventSource
// stream can't carry an image, and this ticket's image upload comes later —
// issue #11). Events: understood, step, verdict, done, error.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message : "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of check(message)) {
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
