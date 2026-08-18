import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Target } from "lucide-react";

interface Resumo {
  leads_total: number;
  agendados: number;
  compareceram: number;
  faltaram: number;
  cancelados: number;
  pacotes_fechados: number;
  receita_pacotes: number;
  taxa_agendamento: number;
  taxa_comparecimento: number;
  taxa_fechamento_pacote: number;
  perfil_quem_nao_fechou: { total: number };
}

const PERIODOS = [7, 30, 90];

export function RelatorioConversao() {
  const [dias, setDias] = useState(30);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [relatorio, setRelatorio] = useState<string>("");

  const gerar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("relatorio-conversao", { body: { dias } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResumo(data.resumo);
      setRelatorio(data.relatorio);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const kpis = resumo
    ? [
        { label: "Leads", value: resumo.leads_total },
        { label: "Agendaram", value: resumo.agendados, sub: `${resumo.taxa_agendamento}%` },
        { label: "Compareceram", value: resumo.compareceram, sub: `${resumo.taxa_comparecimento}%` },
        { label: "Faltaram", value: resumo.faltaram },
        { label: "Pacotes fechados", value: resumo.pacotes_fechados, sub: `${resumo.taxa_fechamento_pacote}%` },
        { label: "Não fecharam", value: resumo.perfil_quem_nao_fechou?.total ?? 0 },
      ]
    : [];

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Relatório de Conversão e Perdas</h3>
        </div>
        <div className="flex items-center gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setDias(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${dias === p ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {p}d
            </button>
          ))}
          <button
            onClick={gerar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analisando..." : "Gerar relatório"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">{erro}</div>
      )}

      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border bg-secondary/40 p-3">
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold tabular-nums">{k.value}</p>
              {k.sub && <p className="text-[11px] text-muted-foreground">{k.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {relatorio ? (
        <div className="rounded-lg border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap">{relatorio}</div>
      ) : !loading && !erro ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Gere o relatório para entender por que os pacientes não estão fechando, quantos agendam, comparecem e fecham pacote de acompanhamento.
        </p>
      ) : null}
    </section>
  );
}
