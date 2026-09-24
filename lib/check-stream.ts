// The browser's side of the Check endpoint: posts a Message and yields its server-sent events.
import { PHOTO_TOO_BIG, type CheckEvent } from "./engine/schemas.ts";

/** Posts a Message's form (`message`, optional `image` and `exif`, `recheck`) and yields its events as they arrive. */
export async function* runCheck(form: FormData): AsyncGenerator<CheckEvent> {
  const response = await fetch("/api/check", { method: "POST", body: form });
  const reader = response.ok ? response.body?.getReader() : undefined;
  if (!reader) {
    // The host turns away a request body over its limit (Vercel: 4.5 MB) before the Check runs.
    yield {
      type: "error",
      message: response.status === 413 ? PHOTO_TOO_BIG : "Something went wrong while checking this. Please try again.",
    };
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
      yield { type: eventLine.slice("event: ".length), ...JSON.parse(dataLine.slice("data: ".length)) } as CheckEvent;
    }
  }
}
