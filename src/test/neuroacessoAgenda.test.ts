import { describe, expect, it } from "vitest";
import { agendamentoNeuroSchema, inicioBrasilia, diaBrasilia } from "@/lib/neuroacessoAgenda";

const dados = { nome: "Maria Silva", telefone: "(11) 99999-9999", email: "maria@example.com", horario_id: "58036627-d960-48c6-bc33-06573d9a75e1" };
describe("Agendamento NeuroAcesso", () => {
  it("exige nome completo", () => { expect(agendamentoNeuroSchema.safeParse({ ...dados, nome: "Maria" }).success).toBe(false); expect(agendamentoNeuroSchema.safeParse(dados).success).toBe(true); });
  it("exige telefone com DDD", () => { expect(agendamentoNeuroSchema.safeParse({ ...dados, telefone: "999999999" }).success).toBe(false); expect(agendamentoNeuroSchema.parse(dados).telefone).toBe("11999999999"); });
  it("exige email válido", () => { expect(agendamentoNeuroSchema.safeParse({ ...dados, email: "maria" }).success).toBe(false); });
  it("exige escolha de horário", () => { expect(agendamentoNeuroSchema.safeParse({ ...dados, horario_id: undefined }).success).toBe(false); });
  it("interpreta o encontro em Brasília", () => { expect(inicioBrasilia("2026-11-12", "14:30")).toBe("2026-11-12T17:30:00.000Z"); expect(diaBrasilia("2026-11-13T01:00:00Z")).toBe("2026-11-12"); });
});