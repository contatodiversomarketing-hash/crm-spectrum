import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { baixarRelatorioPdf } from "@/lib/relatorioPdf";

interface Msg { id: string; conteudo: string; criado_em: string }

export function RelatoriosSalvos({ respostaId, nome }: { respostaId: string; nome: string }) {
  const [itens, setItens] = useState<Msg[] | null>(null);
  useEffect(() => {
    let vivo = true;
    supabase.from("neuroacesso_ia_mensagens").select("id, conteudo, criado_em")
      .eq("resposta_id", respostaId).eq("role", "assistant").order("criado_em", { ascending: false })
      .then(({ data }) => { if (vivo) setItens((data as Msg[]) || []); });
    return () => { vivo = false; };
  }, [respostaId]);
  const dt = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  if (!itens) return <p className="text-sm text-muted-foreground">Carregando relatórios…</p>;
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">Nenhum relatório ainda. Gere um na aba IA de Análise com esta resposta selecionada.</p>;
  return (
    <div className="space-y-4">
      {itens.map((m, i) => (
        <div key={m.id} className="rounded-2xl border bg-card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{i === itens.length - 1 ? "Relatório original" : `Versão ${itens.length - i}`} · {dt(m.criado_em)}{i === 0 && itens.length > 1 ? " · mais recente" : ""}</p>
            <Button size="sm" variant="outline" onClick={() => baixarRelatorioPdf(m.conteudo, { titulo: `Relatório NeuroAcesso — ${nome}`, data: dt(m.criado_em) })}><Download className="h-4 w-4 mr-1" />Baixar PDF</Button>
          </div>
          <div className="prose prose-sm max-w-none max-h-96 overflow-auto"><ReactMarkdown>{m.conteudo}</ReactMarkdown></div>
        </div>
      ))}
    </div>
  );
}
