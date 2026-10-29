export type AnalysisEvent = { type: "progress"; message: string } | { type: "complete" } | { type: "error"; message: string };

// Keep the HTTP connection active even while a model is reasoning silently.
// If the browser disconnects (page reload), the work keeps running so the reply is still saved.
export function analysisStream(work: (send: (event: AnalysisEvent) => void, signal: AbortSignal) => Promise<void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  return new ReadableStream({
    start(controller) {
      const push = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };
      const send = (event: AnalysisEvent) => push(`data: ${JSON.stringify(event)}\n\n`);
      send({ type: "progress", message: "Preparando análise…" });
      heartbeat = setInterval(() => push(": heartbeat\n\n"), 10000);
      const job = work(send, abort.signal).then(() => send({ type: "complete" })).catch(() => {
        send({ type: "error", message: "A análise foi interrompida. Sua mensagem e os anexos foram mantidos." });
      }).finally(() => {
        clearInterval(heartbeat);
        if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } }
      });
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(job);
    },
    cancel() { closed = true; clearInterval(heartbeat); },
  });
}
