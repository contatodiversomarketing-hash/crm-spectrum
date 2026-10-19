import { describe, expect, it } from "vitest";
import { avisoEstaVencido, respostaHumanaValida } from "../../supabase/functions/_shared/aviso-espera";

describe("Aviso após duas horas sem resposta", () => {
  const inicio = "2026-10-19T18:11:00Z";
  it("não envia antes de ultrapassar duas horas", () => {
    expect(avisoEstaVencido(inicio, Date.parse("2026-10-19T20:10:59Z"))).toBe(false);
    expect(avisoEstaVencido(inicio, Date.parse("2026-10-19T20:11:00Z"))).toBe(false);
  });
  it("envia após mais de duas horas", () => {
    expect(avisoEstaVencido(inicio, Date.parse("2026-10-19T20:11:01Z"))).toBe(true);
  });
  it("resposta de qualquer atendente encerra a espera", () => {
    for (const nome of ["José", "Lara", "Fabiana", "Maria Rita"]) {
      expect(respostaHumanaValida({ resposta_final: "Olá", atendente_humano: nome, whatsapp_status: "accepted" })).toBe(true);
    }
  });
  it("resposta da Ana não substitui uma resposta humana", () => {
    expect(respostaHumanaValida({ resposta_final: "Olá", sistema_origem: "ana_whatsapp", whatsapp_status: "sent" })).toBe(false);
  });
  it("envio humano recusado não encerra a espera", () => {
    expect(respostaHumanaValida({ resposta_final: "Olá", sistema_origem: "crm_manual", whatsapp_status: "failed" })).toBe(false);
  });
});