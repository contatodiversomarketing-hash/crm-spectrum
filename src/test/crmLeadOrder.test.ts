import { describe, expect, it } from "vitest";
import { compareConversationLeads } from "../lib/crmLeadOrder";

const old = { criado_em: "2026-10-01T12:00:00Z", ultima_msg_recebida_em: "2026-10-18T12:00:00Z" };
const recent = { criado_em: "2026-09-01T12:00:00Z", ultima_msg_recebida_em: "2026-10-19T18:06:00Z" };

describe("CRM conversation order", () => {
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