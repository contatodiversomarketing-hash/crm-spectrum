import { describe, expect, it } from "vitest";
import { campaignCanSend, findBlackFridayTemplate, BLACK_FRIDAY_NAME, BLACK_FRIDAY_TEXT } from "../../supabase/functions/_shared/black-friday-neuroacesso";

describe("Black Friday campaign safeguards", () => {
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