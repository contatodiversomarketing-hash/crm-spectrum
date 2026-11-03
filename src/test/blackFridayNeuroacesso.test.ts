import { describe, expect, it } from "vitest";
import { campaignCanSend, campaignPlacement, findBlackFridayTemplate, isCampaignExcludedColumn, BLACK_FRIDAY_NAME, BLACK_FRIDAY_TEXT, BLACK_FRIDAY_PIPELINE } from "../../supabase/functions/_shared/black-friday-neuroacesso";

describe("Black Friday campaign safeguards", () => {
  it("excludes Compra concluída from campaign and preserves its card", () => {
    expect(isCampaignExcludedColumn("Compra concluída")).toBe(true);
    expect(isCampaignExcludedColumn("compra_concluida")).toBe(true);
    expect(campaignPlacement({ pipeline_id: "other", status_pipeline: "compra_concluida" }, "neuro")).toEqual({ pipeline_id: "other", status_pipeline: "compra_concluida" });
  });
  it("excludes Aguardando resposta from campaign and preserves its card", () => {
    expect(isCampaignExcludedColumn("Aguardando resposta")).toBe(true);
    expect(isCampaignExcludedColumn("aguardando_resposta")).toBe(true);
    expect(campaignPlacement({ pipeline_id: "other", status_pipeline: "aguardando_resposta" }, "neuro")).toEqual({ pipeline_id: "other", status_pipeline: "aguardando_resposta" });
    expect(isCampaignExcludedColumn("Novo")).toBe(false);
    expect(isCampaignExcludedColumn("Conversa Iniciada")).toBe(false);
  });
  it("places contacts in PLANO NEUROACESSO while preserving stages already in that pipeline", () => {
    expect(BLACK_FRIDAY_PIPELINE).toBe("PLANO NEUROACESSO");
    expect(campaignPlacement({ pipeline_id: "other", status_pipeline: "old" }, "neuro")).toEqual({ pipeline_id: "neuro", status_pipeline: "novo" });
    expect(campaignPlacement({ pipeline_id: "neuro", status_pipeline: "aguardando_resposta" }, "neuro")).toEqual({ pipeline_id: "neuro", status_pipeline: "aguardando_resposta" });
  });
  it("requires approved status", () => {
    expect(campaignCanSend("PENDING", true)).toBe(false);
    expect(campaignCanSend("REJECTED", true)).toBe(false);
    expect(campaignCanSend("APPROVED", true)).toBe(true);
  });
  it("requires consent confirmation", () => {
    expect(campaignCanSend("APPROVED", false)).toBe(false);
  });
  it("refuses an approved template with a different message", () => {
    expect(findBlackFridayTemplate({ data: [{ name: BLACK_FRIDAY_NAME, language: "pt_BR", status: "APPROVED", components: [{ type: "BODY", text: "Outra campanha" }] }] })).toBe("TEXT_MISMATCH");
    expect(findBlackFridayTemplate({ data: [{ name: BLACK_FRIDAY_NAME, language: "pt_BR", status: "APPROVED", components: [{ type: "BODY", text: BLACK_FRIDAY_TEXT }] }] })).toBe("APPROVED");
  });
});