import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Award, RefreshCw, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Resultado {
  metricas: Record<string, number>;
  relatorio: string;
}

const PERIODOS = [7, 15, 30];

function PainelAlvo({ alvo }: { alvo: "ia" | "atendente" }) {
  const [dias, setDias] = useState(7);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);

  const gerar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("avaliar-atendimento", { body: { alvo, dias } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRes(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const labels: Record<string, string> = {
    conversas: "Conversas",
    mensagens: "Mensagens",
    tempo_medio_resposta_min: "Tempo médio (min)",
    tempo_mediano_resposta_min: "Tempo mediano (min)",
    conversas_sem_resposta: "Sem resposta",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODOS.map((p) => (
          <Button key={p} size="sm" variant={dias === p ? "default" : "outline"} className="h-7 text-xs" onClick={() => setDias(p)}>
            {p} dias
          </Button>
        ))}
        <Button size="sm" onClick={gerar} disabled={loading} className="h-7 text-xs ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analisando..." : "Gerar relatório"}
        </Button>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>
      )}

      {res && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(res.metricas || {}).map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-secondary/40 p-3">
                <p className="text-[11px] text-muted-foreground">{labels[k] || k}</p>
                <p className="text-xl font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {res.relatorio}
          </div>
        </>
      )}

      {!res && !loading && !erro && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Clique em "Gerar relatório" para avaliar técnicas de venda, simpatia, tempo de resposta e qualidade do atendimento.
        </p>
      )}
    </div>
  );
}

export function RelatorioAtendimento() {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Award className="h-4 w-4 text-primary" />
        Relatórios de Qualidade do Atendimento
      </h2>
      <Tabs defaultValue="ia">
        <TabsList className="mb-4">
          <TabsTrigger value="ia" className="text-xs gap-1.5"><Bot className="h-3.5 w-3.5" /> Ana (IA)</TabsTrigger>
          <TabsTrigger value="atendente" className="text-xs gap-1.5"><User className="h-3.5 w-3.5" /> Lara (Atendente)</TabsTrigger>
        </TabsList>
        <TabsContent value="ia"><PainelAlvo alvo="ia" /></TabsContent>
        <TabsContent value="atendente"><PainelAlvo alvo="atendente" /></TabsContent>
      </Tabs>
    </section>
  );
}
