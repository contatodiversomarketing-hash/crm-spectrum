import { describe, it, expect } from "vitest";
import { isNeuroMeetingStage, meetingInput, meetingTimestamp } from "../lib/crmMeeting";

describe("NeuroAcesso meetings", () => {
  it("shows meeting scheduling for Plano NeuroAcesso / Call Agendada only", () => {
    expect(isNeuroMeetingStage("PLANO NEUROACESSO", "Call Agendada")).toBe(true);
    expect(isNeuroMeetingStage("Comercial", "Call Agendada")).toBe(false);
    expect(isNeuroMeetingStage("Plano NeuroAcesso", "Conversa Iniciada")).toBe(false);
  });
  it("preserves the scheduled date and time in Brasília", () => {
    expect(meetingTimestamp("2026-10-21T14:30")).toBe("2026-10-21T17:30:00.000Z");
    expect(meetingInput("2026-10-21T17:30:00.000Z")).toBe("2026-10-21T14:30");
  });
  it("does not accept an empty meeting time", () => { expect(meetingTimestamp("")).toBeNull(); });
});
import { isFollowUpStage } from "../lib/crmMeeting";
describe("Follow-up columns", () => {
  it("asks for a return date in any column named follow-up", () => {
    expect(isFollowUpStage("Follow-up")).toBe(true);
    expect(isFollowUpStage("Follow up 2")).toBe(true);
    expect(isFollowUpStage("1º FOLLOWUP")).toBe(true);
    expect(isFollowUpStage("Conversa Iniciada")).toBe(false);
  });
});
