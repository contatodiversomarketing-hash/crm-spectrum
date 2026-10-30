import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import foto from "@/assets/dra-amelia-neuroacesso.jpg.asset.json";

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface PdfOpts {
  titulo: string;
  data: string;
  /** Small gold label on the cover, e.g. "Relatório de análise". */
  tipo?: string;
  /** Person the document is about, shown big on the cover. */
  pessoa?: string;
}

/** Opens the print dialog with a NeuroAcesso-branded document (cover + content); user picks "Salvar como PDF". */
export function baixarRelatorioPdf(conteudo: string, opts: PdfOpts) {
  const corpo = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{conteudo}</ReactMarkdown>);
  const fotoUrl = new URL(foto.url, window.location.origin).href;
  const tipo = opts.tipo || "Relatório de análise";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(opts.titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,900;1,400&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body { font-family: 'Montserrat', sans-serif; color: #1C2B36; font-size: 10pt; line-height: 1.6; margin: 0; }
.capa { width: 210mm; height: 297mm; background: #152733; color: #F3EEE4; position: relative; overflow: hidden; break-after: page; }
.capa .foto { position: absolute; right: 0; top: 0; width: 46%; height: 100%; background: #0d181f url('${fotoUrl}') center/cover; filter: grayscale(1); }
.capa .foto::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, #152733 0%, rgba(21,39,51,0) 35%); }
.capa .n { position: absolute; left: 18mm; top: 18mm; font-family: 'Playfair Display', serif; font-size: 26pt; color: #F3EEE4; }
.capa .txt { position: absolute; left: 18mm; top: 92mm; width: 58%; }
.kicker { font-size: 7.5pt; letter-spacing: .28em; text-transform: uppercase; color: #C9A24A; font-weight: 600; }
.capa h1 { font-family: 'Playfair Display', serif; font-weight: 900; font-size: 40pt; line-height: 1.02; margin: 10px 0 14px; color: #F3EEE4; }
.capa .lema { font-family: 'Playfair Display', serif; font-style: italic; color: #C9A24A; font-size: 12pt; }
.capa .pessoa { margin-top: 26mm; border-top: 1px solid #C9A24A; padding-top: 10px; width: 80%; }
.capa .pessoa .nm { font-family: 'Playfair Display', serif; font-size: 20pt; color: #F3EEE4; margin-top: 6px; }
.capa .pessoa .dt { font-size: 8.5pt; color: #b9c0c4; margin-top: 4px; }
.capa .rod { position: absolute; left: 18mm; bottom: 16mm; font-size: 7.5pt; letter-spacing: .22em; text-transform: uppercase; color: #F3EEE4; }
.capa .rod small { display: block; letter-spacing: 0; text-transform: none; color: #b9c0c4; margin-top: 4px; font-size: 7.5pt; }
.conteudo { padding: 18mm 18mm 20mm; background: #F7F4EE; min-height: 297mm; }
.topo { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #C9A24A; padding-bottom: 8px; margin-bottom: 18px; font-size: 7pt; letter-spacing: .22em; text-transform: uppercase; color: #152733; }
.topo b { font-family: 'Playfair Display', serif; font-size: 13pt; letter-spacing: 0; text-transform: none; }
h1, h2, h3 { font-family: 'Playfair Display', serif; color: #152733; break-after: avoid; }
h1 { font-size: 22pt; font-weight: 900; margin: 6px 0 12px; }
h2 { font-size: 15pt; font-weight: 600; margin: 22px 0 8px; padding: 8px 12px; background: #152733; color: #F3EEE4; border-left: 4px solid #C9A24A; }
h3 { font-size: 11.5pt; margin: 14px 0 4px; font-style: italic; color: #8A6D2E; }
strong { color: #152733; }
p, li { orphans: 3; widows: 3; }
ul, ol { padding-left: 20px; } li { margin: 3px 0; } li::marker { color: #C9A24A; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8.8pt; break-inside: avoid; }
th { background: #152733; color: #F3EEE4; text-align: left; font-weight: 600; } th, td { border: 1px solid #d8cfbd; padding: 5px 7px; }
tr:nth-child(even) td { background: #EFE9DD; }
a { color: #8A6D2E; word-break: break-all; }
blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid #C9A24A; background: #fff; font-family: 'Playfair Display', serif; font-style: italic; }
footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #C9A24A; font-size: 7.5pt; color: #5b6870; text-align: center; letter-spacing: .08em; }
</style></head><body>
<section class="capa"><div class="foto"></div><div class="n">N</div>
<div class="txt"><div class="kicker">${escapeHtml(tipo)}</div><h1>Método<br>NeuroAcesso</h1><div class="lema">Acesso é direito. Método antes de esforço.</div>
${opts.pessoa ? `<div class="pessoa"><div class="kicker">Preparado para</div><div class="nm">${escapeHtml(opts.pessoa)}</div><div class="dt">${escapeHtml(opts.data)}</div></div>` : `<div class="pessoa"><div class="dt">${escapeHtml(opts.data)}</div></div>`}
</div><div class="rod">Dra. Amélia Carvalho<small>Referência brasileira em judicialização de acesso à saúde no neurodesenvolvimento</small></div></section>
<section class="conteudo"><div class="topo"><span>N &nbsp; Método NeuroAcesso</span><b>${escapeHtml(tipo)}</b></div>
<main>${corpo}</main>
<footer>MÉTODO NEUROACESSO · DRA. AMÉLIA CARVALHO · DOCUMENTO CONFIDENCIAL</footer></section>
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
    await new Promise<void>((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = fotoUrl; });
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  if (doc.readyState === "complete") void imprimir(); else frame.onload = () => void imprimir();
}
