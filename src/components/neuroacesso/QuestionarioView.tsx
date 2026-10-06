import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import type { Secao } from "@/lib/neuroacessoQuestionario";

export type Respostas = Record<string, unknown>;

/** Renderiza o questionário. Sem onChange = modo leitura (respostas recebidas). */
export function QuestionarioView({ secoes, valores, onChange }: { secoes: Secao[]; valores: Respostas; onChange?: (id: string, v: unknown) => void }) {
  const leitura = !onChange;
  const vazio = <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="space-y-6">
      {secoes.map((s) => (
        <section key={s.titulo} className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
          <div>
            <h2 className="font-display text-2xl text-primary">{s.titulo}</h2>
            {s.subtitulo && <p className="text-sm text-muted-foreground mt-1">{s.subtitulo}</p>}
          </div>
          {s.perguntas.map((p) => {
            if (p.tipo === "aviso") return (
              <div key={p.id} className="flex gap-2 rounded-lg bg-secondary/60 p-3 text-sm text-secondary-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-accent" /> {p.label}
              </div>
            );
            if (p.tipo === "texto") {
              const v = String(valores[p.id] ?? "");
              return (
                <div key={p.id} className="space-y-1.5">
                  <Label className="text-sm font-medium">{p.label}</Label>
                  {leitura ? <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">{v || vazio}</p>
                    : p.longo ? <Textarea rows={3} value={v} onChange={(e) => onChange!(p.id, e.target.value)} />
                    : <Input value={v} onChange={(e) => onChange!(p.id, e.target.value)} />}
                </div>
              );
            }
            if (p.tipo === "opcoes") {
              const v = String(valores[p.id] ?? "");
              return (
                <div key={p.id} className="space-y-2">
                  <Label className="text-sm font-medium">{p.label}</Label>
                  <div className="grid gap-2">
                    {p.opcoes.map((o) => (
                      <label key={o} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${v === o ? "border-primary bg-primary/10" : ""} ${leitura ? "" : "cursor-pointer"}`}>
                        <input type="radio" disabled={leitura} checked={v === o} onChange={() => onChange?.(p.id, o)} className="accent-[hsl(var(--primary))]" />
                        {o}
                      </label>
                    ))}
                  </div>
                </div>
              );
            }
            const tab = (valores[p.id] as Record<string, Record<string, string>>) || {};
            return (
              <div key={p.id} className="space-y-2">
                {p.label && <Label className="text-sm font-medium">{p.label}</Label>}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-primary text-primary-foreground">
                      <tr>
                        <th className="text-left p-2 font-medium">{p.primeiraColuna}</th>
                        {p.colunas.map((c) => <th key={c} className="text-left p-2 font-medium">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {p.linhas.map((l, li) => (
                        <tr key={l} className={li % 2 ? "bg-muted/30" : ""}>
                          <td className="p-2 align-top font-medium w-1/3">{l}</td>
                          {p.colunas.map((c) => (
                            <td key={c} className="p-1.5 align-top min-w-[160px]">
                              {leitura ? <span className="whitespace-pre-wrap">{tab[l]?.[c] || vazio}</span>
                                : <Textarea rows={1} className="min-h-[38px]" value={tab[l]?.[c] ?? ""}
                                    onChange={(e) => onChange!(p.id, { ...tab, [l]: { ...(tab[l] || {}), [c]: e.target.value } })} />}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
