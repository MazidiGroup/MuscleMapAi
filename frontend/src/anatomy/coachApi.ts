// Streaming client for the anatomy AI coach SSE endpoint.
const URL = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/coach/ask`;

export type CoachTurn = { role: "user" | "assistant"; content: string };

type Handlers = {
  onDelta: (text: string) => void;
  onDone: () => void;
  onFail: () => void;
};

function parseSSE(chunk: string, h: Handlers): boolean {
  // returns true if a terminal event (done/failed) was seen
  const lines = chunk.split("\n");
  let terminal = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const json = t.slice(5).trim();
    if (!json) continue;
    try {
      const obj = JSON.parse(json);
      if (obj.delta) h.onDelta(obj.delta);
      if (obj.done) {
        h.onDone();
        terminal = true;
      }
      if (obj.failed) {
        h.onFail();
        terminal = true;
      }
    } catch {
      // ignore partial json
    }
  }
  return terminal;
}

export async function askCoach(message: string, history: CoachTurn[], context: string | null, h: Handlers) {
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, context }),
    });

    // Streaming path (web / platforms with ReadableStream support)
    const body: any = res.body;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (parseSSE(part, h)) return;
        }
      }
      if (buffer) parseSSE(buffer, h);
      h.onDone();
      return;
    }

    // Fallback: read whole text and parse all events at once.
    const text = await res.text();
    const terminal = parseSSE(text, h);
    if (!terminal) h.onDone();
  } catch {
    h.onFail();
  }
}
