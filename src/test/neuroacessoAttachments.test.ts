import { describe, expect, it } from "vitest";
import { attachmentError, withMaterial, MATERIAL_MARKER } from "../../supabase/functions/_shared/neuroacesso-attachments";

describe("NeuroAcesso attachment teachings", () => {
  it("accepts photos and PDFs together", () => {
    expect(attachmentError([{ type: "image/jpeg", size: 200 }, { type: "application/pdf", size: 300 }])).toBeNull();
  });
  it("retains extracted photo and PDF knowledge in permanent message content", () => {
    const stored = withMaterial("Ensine o método", ["aula.pdf", "quadro.jpg"], "Critério: revisar o laudo antes do relatório jurídico.");
    expect(stored.split(MATERIAL_MARKER)[1]).toBe("Critério: revisar o laudo antes do relatório jurídico.");
    expect(stored).toContain("aula.pdf, quadro.jpg");
  });
  it("rejects other attachment formats", () => {
    expect(attachmentError([{ type: "application/zip", size: 10 }])).not.toBeNull();
  });
  it("enforces file size and total request bounds", () => {
    expect(attachmentError([{ type: "application/pdf", size: 5 * 1024 * 1024 + 1 }])).not.toBeNull();
    expect(attachmentError(Array.from({ length: 3 }, () => ({ type: "application/pdf", size: 4 * 1024 * 1024 })))).not.toBeNull();
  });
});