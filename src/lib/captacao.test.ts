import { describe, expect, it } from "vitest";
import { chaveCaptacao, mensagemCaptacao, nomeCaptacaoValido, telefoneCaptacaoValido, consentimentoCaptacaoValido } from "../../supabase/functions/_shared/captacao";
import { telVariacoes, telCanonico } from "../../supabase/functions/_shared/dedup";

const input = { action: "submit", slug: "neuroacesso", nome: "Maria Silva", telefone: "(11) 98765-4321", consentimento: true, request_id: "2d2e5d70-23d3-4c55-9d10-5ab340da7e82" };
describe("cadastro dos anúncios", () => {
  it("aceita nome completo e WhatsApp com DDD", () => {
    expect(nomeCaptacaoValido(input.nome)).toBe(true);
    expect(nomeCaptacaoValido("Maria")).toBe(false);
    expect(telefoneCaptacaoValido(input.telefone)).toBe(true);
    expect(telCanonico(input.telefone)).toBe("5511987654321");
  });
  it("exige autorização para contato", () => {
    expect(consentimentoCaptacaoValido(false)).toBe(false);
    expect(consentimentoCaptacaoValido(true)).toBe(true);
  });
  it("identifica a mesma pessoa com e sem o nono dígito", () => {
    expect(chaveCaptacao("5511987654321")).toBe(chaveCaptacao("551187654321"));
    expect(telVariacoes("5511987654321")).toContain("551187654321");
  });
  it("leva nome, telefone e oferta escolhida para a mensagem do WhatsApp", () => {
    const msg = mensagemCaptacao("Endocannabis Academy", "Maria Silva", "5511987654321");
    expect(msg).toContain("Endocannabis Academy");
    expect(msg).toContain("Nome: Maria Silva");
    expect(msg).toContain("WhatsApp: 5511987654321");
  });
  it("rejeita telefones incompletos", () => {
    expect(telefoneCaptacaoValido("1234")).toBe(false);
  });
  it("mantém o número de destino informado pela equipe", () => {
    expect(telCanonico("32 9803-4423")).toBe("553298034423");
  });
});