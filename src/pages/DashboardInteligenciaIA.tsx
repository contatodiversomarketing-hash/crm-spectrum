import { useState, useEffect, useCallback } from "react";
import { Brain, MessageSquare, Phone, CheckCircle, TrendingUp, RefreshCw, Sparkles, LogOut, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardData {
  totalMensagens: number;
  totalLigacoes: number;
  taxaConfirmacao: number;
  taxaConversaoLeads: number;
  conversaoPorTipo: { tipo: string; total: number; respondidos: number; taxa: number }[];
  topPacientes: { id: string; nome: string; score: number; status: string }[];
}

interface InsightData {
  insight: string;
  loading: boolean;
  error: string | null;
}

const DashboardInteligenciaIA = () => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const [data, setData] = useState<DashboardData>({
    totalMensagens: 0,
    totalLigacoes: 0,
    taxaConfirmacao: 0,
    taxaConversaoLeads: 0,
    conversaoPorTipo: [],
    topPacientes: [],
  });
  const [insightData, setInsightData] = useState<InsightData>({ insight: "", loading: false, error: null });
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [autoRes, logRes] = await Promise.all([
        supabase.from("automacoes").select("*").gte("criado_em", seteDiasAtras),
        supabase.from("logs_decisao").select("*").gte("criado_em", seteDiasAtras).limit(500),
      ]);

      const automacoes = autoRes.data || [];
      const logs = logRes.data || [];

      const totalMensagens = automacoes.filter(a => ["reativacao_score", "prospeccao_lead"].includes(a.tipo)).length;
      const totalLigacoes = automacoes.filter(a => ["reativacao_voz"].includes(a.tipo)).length;

      const confirmacaoLogs = logs.filter(l => l.evento === "confirmacao_voz");
      const confirmados = confirmacaoLogs.filter(l => l.decisao === "confirmado").length;
      const taxaConfirmacao = confirmacaoLogs.length > 0 ? (confirmados / confirmacaoLogs.length) * 100 : 0;

      const leadsEnviados = automacoes.filter(a => a.tipo === "prospeccao_lead" && a.status === "enviado").length;
      const leadsRespondidos = automacoes.filter(a => a.tipo === "prospeccao_lead" && a.respondeu).length;
      const taxaConversaoLeads = leadsEnviados > 0 ? (leadsRespondidos / leadsEnviados) * 100 : 0;

      // Conversão por tipo
      const tipoMap: Record<string, { total: number; respondidos: number }> = {};
      for (const a of automacoes) {
        if (!tipoMap[a.tipo]) tipoMap[a.tipo] = { total: 0, respondidos: 0 };
        tipoMap[a.tipo].total++;
        if (a.respondeu) tipoMap[a.tipo].respondidos++;
      }

      const conversaoPorTipo = Object.entries(tipoMap).map(([tipo, v]) => ({
        tipo,
        total: v.total,
        respondidos: v.respondidos,
        taxa: v.total > 0 ? (v.respondidos / v.total) * 100 : 0,
      }));

      // Top 10 pacientes por score
      const pacientesComScore = automacoes
        .filter(a => a.payload && typeof a.payload === "object")
        .map(a => {
          const p = a.payload as Record<string, unknown>;
          return {
            id: a.paciente_externo_id,
            nome: (p.nome as string) || a.paciente_externo_id,
            score: Number(p.score ?? 0),
            status: a.respondeu ? "respondeu" : a.status === "nao_interessado_temporario" ? "ignorou" : a.status === "enviado" ? "aguardando" : a.status,
          };
        })
        .sort((a, b) => b.score - a.score)
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
        .slice(0, 10);

      setData({
        totalMensagens,
        totalLigacoes,
        taxaConfirmacao,
        taxaConversaoLeads,
        conversaoPorTipo,
        topPacientes: pacientesComScore,
      });
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightData({ insight: "", loading: true, error: null });
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gerar-insights-ia");
      if (fnError) throw fnError;
      setInsightData({ insight: fnData.insight, loading: false, error: null });
    } catch (err: any) {
      console.error("Erro ao gerar insights:", err);
      setInsightData({ insight: "", loading: false, error: err.message || "Erro ao gerar insights" });
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const maxTotal = Math.max(...data.conversaoPorTipo.map(c => c.total), 1);

  const statusColors: Record<string, string> = {
    respondeu: "bg-success text-success-foreground",
    aguardando: "bg-warning text-warning-foreground",
    ignorou: "bg-destructive text-destructive-foreground",
  };

  const tipoLabels: Record<string, string> = {
    reativacao_score: "Reativação WhatsApp",
    reativacao_voz: "Reativação Voz",
    prospeccao_lead: "Prospecção Leads",
    confirmacao_voz: "Confirmação",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Dashboard Inteligência IA</h1>
              <p className="text-xs text-muted-foreground">Métricas e insights dos últimos 7 dias</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {profile && <span className="text-xs text-muted-foreground hidden sm:inline">{profile.nome || profile.email}</span>}
            <button onClick={signOut} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Sair">
              <LogOut className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={MessageSquare}
            title="Mensagens Enviadas"
            value={data.totalMensagens}
            color="bg-info"
            loading={loading}
          />
          <KPICard
            icon={Phone}
            title="Ligações Realizadas"
            value={data.totalLigacoes}
            color="bg-primary"
            loading={loading}
          />
          <KPICard
            icon={CheckCircle}
            title="Taxa Confirmação"
            value={`${data.taxaConfirmacao.toFixed(1)}%`}
            color="bg-success"
            loading={loading}
          />
          <KPICard
            icon={TrendingUp}
            title="Conversão Leads"
            value={`${data.taxaConversaoLeads.toFixed(1)}%`}
            color="bg-accent"
            loading={loading}
          />
        </section>

        {/* Chart + Table */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">Conversão por Tipo</h3>
            {data.conversaoPorTipo.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período</p>
            ) : (
              <div className="space-y-4">
                {data.conversaoPorTipo.map((item) => (
                  <div key={item.tipo} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate">{tipoLabels[item.tipo] || item.tipo}</span>
                      <span className="text-muted-foreground text-xs">
                        {item.respondidos}/{item.total} ({item.taxa.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-6 w-full rounded-md bg-secondary overflow-hidden relative">
                      {/* Total bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-md bg-muted-foreground/20 transition-all duration-500"
                        style={{ width: `${(item.total / maxTotal) * 100}%` }}
                      />
                      {/* Respondidos bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-md bg-primary transition-all duration-500"
                        style={{ width: `${(item.respondidos / maxTotal) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-primary-foreground">
                        {item.respondidos > 0 ? item.respondidos : ""}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                    Respondidos
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/20" />
                    Total
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Patients Table */}
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">Top 10 Pacientes por Score</h3>
            {data.topPacientes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground">Paciente</th>
                      <th className="text-center py-2 px-2 font-medium text-muted-foreground">Score</th>
                      <th className="text-center py-2 pl-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPacientes.map((p, i) => (
                      <tr key={`${p.id}-${i}`} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-2 font-medium truncate max-w-[180px]">{p.nome}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="inline-flex items-center justify-center h-6 w-10 rounded-md bg-secondary text-xs font-semibold">
                            {p.score}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || "bg-secondary text-secondary-foreground"}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* AI Insights */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Insights IA</h3>
            </div>
            <button
              onClick={fetchInsights}
              disabled={insightData.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${insightData.loading ? "animate-spin" : ""}`} />
              {insightData.loading ? "Gerando..." : "Gerar Insights"}
            </button>
          </div>

          {insightData.error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {insightData.error}
            </div>
          )}

          {insightData.insight ? (
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
              {insightData.insight}
            </div>
          ) : !insightData.loading && !insightData.error ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Clique em "Gerar Insights" para obter uma análise inteligente dos seus dados.
            </p>
          ) : insightData.loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Analisando dados com IA...
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

function KPICard({ icon: Icon, title, value, color, loading }: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 rounded bg-secondary animate-pulse" />
      ) : (
        <p className="text-2xl font-bold tracking-tight">{value}</p>
      )}
    </div>
  );
}

export default DashboardInteligenciaIA;
