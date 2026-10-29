import { describe, expect, it, vi } from "vitest";
import { analysisStream } from "../../supabase/functions/_shared/analysis-stream";
import { readAnalysisStream } from "../lib/neuroacessoStream";

describe("NeuroAcesso long-running analysis", () => {
  it("sends heartbeats during more than 150 seconds of silent processing", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const stream = analysisStream(async () => await new Promise<void>((resolve) => { finish = resolve; }));
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain("Preparando análise");
    for (let i = 0; i < 16; i++) {
      await vi.advanceTimersByTimeAsync(10000);
      expect(decoder.decode((await reader.read()).value)).toBe(": heartbeat\n\n");
    }
    finish?.();
    expect(decoder.decode((await reader.read()).value)).toContain('"type":"complete"');
    expect((await reader.read()).done).toBe(true);
    vi.useRealTimers();
  });
  it("accepts split stream frames and only succeeds after saved completion", async () => {
    const progress = vi.fn();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(encoder.encode('data: {"type":"progress","message":"Lendo'));
      c.enqueue(encoder.encode(' materiais"}\n\n: heartbeat\n\ndata: {"type":"complete"}\n\n'));
      c.close();
    } });
    await readAnalysisStream(new Response(stream), progress);
    expect(progress).toHaveBeenCalledWith("Lendo materiais");
  });
  it("reports interrupted connections rather than clearing unsaved input", async () => {
    await expect(readAnalysisStream(new Response(': heartbeat\n\n'), vi.fn())).rejects.toThrow("antes de concluir");
  });
  it("surfaces stream failure instead of treating HTTP 200 as success", async () => {
    const stream = analysisStream(async () => { throw new Error("provider failure"); });
    await expect(readAnalysisStream(new Response(stream), vi.fn())).rejects.toThrow("anexos foram mantidos");
  });
});