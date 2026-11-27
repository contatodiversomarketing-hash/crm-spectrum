import { telBase, telCanonico } from "./dedup.ts";

export const nomeCaptacaoValido = (v: string) => v.trim().split(/\s+/).length >= 2;
export const telefoneCaptacaoValido = (v: string) => /^55[1-9]{2}\d{8,9}$/.test(telCanonico(v));
export const consentimentoCaptacaoValido = (v: boolean) => v === true;

export function chaveCaptacao(telefone: string) {
  const base = telBase(telefone);
  return base.length === 11 && base[2] === "9" ? base.slice(0, 2) + base.slice(3) : base;
}

export function mensagemCaptacao(titulo: string, nome: string, telefone: string) {
  return `Olá! Tenho interesse em ${titulo}.\n\nNome: ${nome}\nWhatsApp: ${telefone}\n\nPreenchi meu cadastro pelo anúncio e gostaria de conversar com a equipe.`;
}