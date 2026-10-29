import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import logo from "@/assets/logo-amelia.png";

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Opens the print dialog with a branded report; the user chooses "Salvar como PDF". */
export function baixarRelatorioPdf(conteudo: string, opts: { titulo: string; data: string }) {
  const corpo = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{conteudo}</ReactMarkdown>);
  const logoUrl = new URL(logo, window.location.origin).href;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(opts.titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 18mm 16mm 20mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: 'DM Sans', sans-serif; color: #2D3142; font-size: 11pt; line-height: 1.55; margin: 0; background: #FAF7F2; }
header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #6B8771; padding-bottom: 12px; margin-bottom: 18px; }
header img { width: 54px; height: 54px; object-fit: contain; }
header .t { font-family: 'Cormorant Garamond', serif; font-size: 20pt; font-weight: 600; color: #6B8771; line-height: 1.1; }
header .s { font-size: 9pt; color: #C4724A; letter-spacing: .08em; text-transform: uppercase; }
header .d { margin-left: auto; font-size: 9pt; color: #6b6f7d; text-align: right; }
h1, h2, h3 { font-family: 'Cormorant Garamond', serif; color: #2D3142; break-after: avoid; }
h1 { font-size: 22pt; color: #6B8771; margin: 6px 0 12px; }
h2 { font-size: 15pt; margin: 20px 0 8px; padding: 4px 10px; border-left: 4px solid #C4724A; background: #E8D5B055; }
h3 { font-size: 12.5pt; margin: 14px 0 6px; color: #6B8771; }
p, li { orphans: 3; widows: 3; }
ul, ol { padding-left: 20px; } li { margin: 3px 0; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5pt; break-inside: avoid; }
th { background: #6B8771; color: #FAF7F2; text-align: left; } th, td { border: 1px solid #d9cfbf; padding: 5px 7px; }
a { color: #C4724A; word-break: break-all; }
blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid #6B8771; background: #fff; }
footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #E8D5B0; font-size: 8.5pt; color: #6b6f7d; text-align: center; }
</style></head><body>
<header><img src="${logoUrl}" alt=""><div><div class="t">Dra. Amélia Carvalho</div><div class="s">Método NeuroAcesso · Relatório de análise</div></div><div class="d">${escapeHtml(opts.data)}</div></header>
<main>${corpo}</main>
<footer>Cuidado que entende. Tratamento que transforma. — Documento interno da equipe Dra. Amélia Carvalho</footer>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  const imprimir = async () => {
    const w = frame.contentWindow!;
    try { await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* fonts optional */ }
    const img = doc.querySelector("img");
    if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  if (doc.readyState === "complete") void imprimir(); else frame.onload = () => void imprimir();
}
