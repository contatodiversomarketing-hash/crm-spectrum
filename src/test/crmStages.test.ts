import { describe, expect, it } from "vitest";
import { extractedStage, replyStage } from "../../supabase/functions/_shared/crm-stages";
import { buscarLead, telVariacoes } from "../../supabase/functions/_shared/dedup";

const columns = [
  { chave: "novo", nome: "Novo", ordem: 0 },
  { chave: "conversa_iniciada", nome: "Conversa Iniciada", ordem: 1 },
  { chave: "call_agendada", nome: "Call Agendada", ordem: 2 },
  { chave: "aguardando_resposta", nome: "Aguardando resposta", ordem: 3 },
];

describe("CRM pipeline-safe reply stages", () => {
  it("moves a new reply to conversa_iniciada", () => {
    expect(replyStage("novo", columns)).toBe("conversa_iniciada");
  });
  it("recovers Thaysa's invalid em_contato column", () => {
    expect(replyStage("em_contato", columns)).toBe("conversa_iniciada");
  });
  it("does not hide a conversation when Ana proposes em_contato", () => {
    expect(extractedStage("conversa_iniciada", "em_contato", columns)).toBe("conversa_iniciada");
  });
  it("ignores extracted stages missing from the pipeline", () => {
    expect(extractedStage("conversa_iniciada", "triagem_recebida", columns)).toBe("conversa_iniciada");
  });
  it("preserves an already scheduled call on reply", () => {
    expect(replyStage("call_agendada", columns)).toBe("call_agendada");
  });
  it("keeps Aguardando resposta on reply (manual moves only)", () => {
    expect(replyStage("aguardando_resposta", columns)).toBe("aguardando_resposta");
  });
  it("keeps Aguardando resposta when Ana extracts a later stage", () => {
    expect(extractedStage("aguardando_resposta", "agendado", columns)).toBe("aguardando_resposta");
  });
  it("uses a valid first column when there is no conversation stage", () => {
    expect(replyStage("em_contato", [{ chave: "outubro", nome: "Outubro", ordem: 0 }])).toBe("outubro");
  });
  it("finds the same existing card with or without the ninth digit", async () => {
    const records = [
      { id: "thaysa-existing", telefone: "556984100731", criado_em: "2026-09-23" },
      { id: "thaysa-sheet", telefone: "5569984100731", criado_em: "2026-08-20" },
    ];
    const client = { from: () => ({ select: () => ({ in: (_: string, variants: string[]) => ({
      order: (_: string, options: { ascending: boolean }) => ({ limit: () => ({ data: records.filter((r) => variants.includes(r.telefone)).sort((a, b) => options.ascending ? a.criado_em.localeCompare(b.criado_em) : b.criado_em.localeCompare(a.criado_em)).slice(0, 1) }) }),
    }) }) }) };
    expect(telVariacoes("556984100731")).toContain("5569984100731");
    expect((await buscarLead(client, "556984100731"))?.id).toBe("thaysa-sheet");
    expect((await buscarLead(client, "5569984100731"))?.id).toBe("thaysa-sheet");
  });
});