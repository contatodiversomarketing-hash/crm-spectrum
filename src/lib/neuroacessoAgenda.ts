import { z } from "zod";

export const agendamentoNeuroSchema = z.object({
  nome: z.string().trim().min(3, "Informe seu nome completo").max(150).refine((v) => /\S+\s+\S+/.test(v), "Informe nome e sobrenome"),
  telefone: z.string().max(30).transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^\d{10,15}$/, "Informe telefone com DDD")),
  email: z.string().trim().email("Informe um e-mail válido").max(255),
  horario_id: z.string().uuid("Escolha um horário"),
});

export const diaBrasilia = (s: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s));
export const horaBrasilia = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
export const dataBrasilia = (s: string) => new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });
export const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const inicioBrasilia = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
export type HorarioNeuro = { id: string; inicio: string; fim: string; ativo?: boolean };
export const LINK_AGENDA_NEURO = "https://crm-spectrum.lovable.app/agendar/neuroacesso";