export type AnalysisEvent = { type: "progress"; message: string } | { type: "complete" } | { type: "error"; message: string };

// Keep the HTTP connection active even while a model is reasoning silently.
export function analysisStream(work: (send: (event: AnalysisEvent) => void, signal: AbortSignal) => Promise<void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  return new ReadableStream({
    start(controller) {
      const send = (event: AnalysisEvent) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: "progress", message: "Preparando análise…" });
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 10000);
      void work(send, abort.signal).then(() => send({ type: "complete" })).catch(() => {
        send({ type: "error", message: "A análise foi interrompida. Sua mensagem e os anexos foram mantidos." });
      }).finally(() => {
        clearInterval(heartbeat);
        if (!closed) { closed = true; controller.close(); }
      });
    },
    cancel() { closed = true; clearInterval(heartbeat); abort.abort(); },
  });
}