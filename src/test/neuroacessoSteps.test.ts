import { describe, expect, it } from "vitest";
import { afterWriteStep, isStaleJob, MAX_WRITE_HOPS } from "../../supabase/functions/_shared/analysis-steps";

describe("NeuroAcesso report written in chained steps", () => {
  it("finishes with all parts joined when the model completes", () => {
    expect(afterWriteStep({ parcial: "Parte 1. ", hops: 1 }, { text: "Parte 2.", completed: true }))
      .toEqual({ kind: "finish", texto: "Parte 1. Parte 2." });
  });
  it("continues in a new step when the time budget ends before completion", () => {
    expect(afterWriteStep({ parcial: "", hops: 0 }, { text: "Início", completed: false }))
      .toEqual({ kind: "continue", parcial: "Início", hops: 1 });
  });
  it("delivers the written text instead of losing it after the last allowed step", () => {
    expect(afterWriteStep({ parcial: "Quase tudo", hops: MAX_WRITE_HOPS - 1 }, { text: " pronto", completed: false }))
      .toEqual({ kind: "finish", texto: "Quase tudo pronto" });
  });
  it("treats an active job without updates for over 4 minutes as stopped", () => {
    const now = Date.parse("2026-10-29T18:10:00Z");
    expect(isStaleJob({ status: "redigindo", atualizado_em: "2026-10-29T18:05:00Z" }, now)).toBe(true);
    expect(isStaleJob({ status: "redigindo", atualizado_em: "2026-10-29T18:07:00Z" }, now)).toBe(false);
    expect(isStaleJob({ status: "concluido", atualizado_em: "2026-10-29T17:00:00Z" }, now)).toBe(false);
  });
});
