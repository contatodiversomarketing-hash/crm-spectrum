import { FileText } from "lucide-react";
const RE_MIDIA = /\[midia:(image|audio|document|video):(\S+?)\]/g;

export function ConteudoMensagem({ texto, escuro }: { texto: string; escuro?: boolean }) {
  const midias: { tipo: string; url: string }[] = [];
  const limpo = texto.replace(RE_MIDIA, (_m, tipo: string, url: string) => {
    midias.push({ tipo, url });
    return "";
  }).trim();
  return (
    <div className="space-y-2">
      {limpo && <p className="text-sm whitespace-pre-wrap break-words">{limpo}</p>}
      {midias.map((m, idx) => {
        if (m.tipo === "image") {
          return (
            <a key={idx} href={m.url} target="_blank" rel="noreferrer">
              <img src={m.url} alt="Imagem enviada na conversa" className="max-h-64 rounded-lg border" loading="lazy" />
            </a>
          );
        }
        if (m.tipo === "audio") {
          return <audio key={idx} controls src={m.url} className="h-9 w-56 max-w-full" />;
        }
        if (m.tipo === "video") {
          return <video key={idx} controls src={m.url} className="max-h-64 rounded-lg border" />;
        }
        return (
          <a
            key={idx}
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-2 text-xs underline ${escuro ? "opacity-90" : "text-primary"}`}
          >
            <FileText className="h-3.5 w-3.5" /> Abrir arquivo
          </a>
        );
      })}
    </div>
  );
}
