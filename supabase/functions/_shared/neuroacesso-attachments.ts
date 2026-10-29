export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const MATERIAL_MARKER = "\n\n---\nCONTEÚDO DOS MATERIAIS:\n";

export function attachmentError(files: { type: string; size: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return "Anexe no máximo 5 arquivos por mensagem.";
  if (files.some((f) => !ATTACHMENT_TYPES.includes(f.type))) return "Use fotos JPG, PNG, WebP ou PDFs.";
  if (files.some((f) => f.size <= 0 || f.size > MAX_ATTACHMENT_BYTES)) return "Cada arquivo deve ter até 5 MB e não pode estar vazio.";
  if (files.reduce((total, f) => total + f.size, 0) > MAX_TOTAL_BYTES) return "Os anexos juntos devem ter até 10 MB.";
  return null;
}

export function withMaterial(message: string, names: string[], extracted: string): string {
  if (!names.length) return message;
  return `${message}\n\nAnexos: ${names.join(", ")}${MATERIAL_MARKER}${extracted}`;
}