export async function readAnalysisStream(response: Response, progress: (message: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Não foi possível acompanhar a análise.");
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const event: unknown = JSON.parse(line.slice(6));
          if (!event || typeof event !== "object" || !("type" in event)) continue;
          if (event.type === "complete") complete = true;
          if ("message" in event && typeof event.message === "string") {
            if (event.type === "error") throw new Error(event.message);
            if (event.type === "progress") progress(event.message);
          }
        }
      }
      if (done) break;
    }
    if (!complete) throw new Error("A conexão foi interrompida antes de concluir. Sua mensagem e os anexos foram mantidos.");
  } finally { reader.releaseLock(); }
}