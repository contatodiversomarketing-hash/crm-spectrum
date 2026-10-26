import { describe, expect, it } from "vitest";
import { compareColumnLeads, compareConversationLeads } from "../lib/crmLeadOrder";

const old = { criado_em: "2026-10-01T12:00:00Z", ultima_msg_recebida_em: "2026-10-18T12:00:00Z" };
const recent = { criado_em: "2026-09-01T12:00:00Z", ultima_msg_recebida_em: "2026-10-19T18:06:00Z" };

describe("CRM conversation order", () => {
  it("orders Call Agendada by ascending meeting date and time even for unread cards", () => {
    const early = { ...old, reuniao_em: "2026-10-27T09:00:00-03:00" };
    const later = { ...recent, reuniao_em: "2026-10-27T10:00:00-03:00", nao_lidas: 2 };
    const nextDay = { ...recent, reuniao_em: "2026-10-28T08:00:00-03:00", nao_lidas: 3 };
    expect([nextDay, later, early].sort((a, b) => compareColumnLeads("Call Agendada", a, b))).toEqual([early, later, nextDay]);
  });
  it("places missing or invalid meeting dates last", () => {
    const scheduled = { ...old, reuniao_em: "2026-10-27T09:00:00-03:00" };
    const invalid = { ...recent, reuniao_em: "invalid" };
    expect([recent, invalid, scheduled].sort((a, b) => compareColumnLeads("Call Agendada", a, b))[0]).toEqual(scheduled);
  });
  it("preserves unread priority in other columns", () => {
    const unread = { ...old, nao_lidas: 1, reuniao_em: "2026-10-28T09:00:00-03:00" };
    const read = { ...recent, reuniao_em: "2026-10-27T09:00:00-03:00" };
    expect([read, unread].sort((a, b) => compareColumnLeads("Conversa Iniciada", a, b))).toEqual([unread, read]);
  });
  it("puts the latest read conversation first instead of the newest registration", () => {
    expect([old, recent].sort(compareConversationLeads)).toEqual([recent, old]);
  });
  it("keeps unread conversations above read conversations", () => {
    const unread = { ...old, nao_lidas: 1 };
    expect([recent, unread].sort(compareConversationLeads)).toEqual([unread, recent]);
  });
  it("sorts unread conversations by most recent activity", () => {
    const a = { ...old, nao_lidas: 3 };
    const b = { ...recent, nao_lidas: 1 };
    expect([a, b].sort(compareConversationLeads)).toEqual([b, a]);
  });
  it("also considers outgoing follow-up activity", () => {
    const outgoing = { ...old, followup_ultimo_envio: "2026-10-19T19:00:00Z" };
    expect([recent, outgoing].sort(compareConversationLeads)).toEqual([outgoing, recent]);
  });
});