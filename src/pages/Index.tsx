import { Activity, MessageSquare, Zap, Shield, TrendingUp, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusCard } from "@/components/StatusCard";
import { SystemStatusBadge } from "@/components/SystemStatusBadge";
import { RecentInteractions } from "@/components/RecentInteractions";
import { AutomationQueue } from "@/components/AutomationQueue";
import { ChannelToggles } from "@/components/ChannelToggles";
import { PainelMetricas } from "@/components/PainelMetricas";
import { useDadosIntegrados } from "@/hooks/useDadosIntegrados";

const Index = () => {
  const navigate = useNavigate();
  const dados = useDadosIntegrados();

  const systemStatus = dados.error ? ("degraded" as const) : ("online" as const);

  return (
    <div className="bg-background">
      {/* Top bar with status */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Core IA Clínica</h1>
          <p className="text-xs text-muted-foreground">Central de Orquestração Inteligente</p>
        </div>
        <div className="flex items-center gap-3">
          <ChannelToggles />
          <div className="w-px h-6 bg-border" />
          <SystemStatusBadge status={systemStatus} label={`${dados.systems.filter(s => s.status === "online").length}/${dados.systems.length} sistemas`} />
          <button
            onClick={dados.refresh}
            disabled={dados.loading}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-5 w-5 text-muted-foreground ${dados.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatusCard
            title="Leads CRM"
            value={dados.loading ? "..." : (dados.crm?.funil.total_leads ?? 0)}
            subtitle={dados.crm ? `${dados.crm.leads.novos} novos` : "Carregando..."}
            icon={MessageSquare}
            variant="info"
          />
          <StatusCard
            title="Automações Hoje"
            value={dados.loading ? "..." : dados.automacoesExecutadas}
            subtitle={`${dados.taxaSucessoAutomacoes.toFixed(0)}% taxa de sucesso`}
            icon={Zap}
            variant="success"
          />
          <div onClick={() => navigate("/supervisao")} className="cursor-pointer">
            <StatusCard
              title="Supervisões Pendentes"
              value={dados.loading ? "..." : dados.supervisoesPendentes}
              subtitle="Aguardando revisão"
              icon={Shield}
              variant="warning"
            />
          </div>
          <StatusCard
            title="Pacientes Inativos"
            value={dados.loading ? "..." : (dados.gestao?.pacientes_inativos ?? 0)}
            subtitle="Sem consulta há 6 meses"
            icon={Activity}
          />
          <div onClick={() => navigate("/dashboard-ia")} className="cursor-pointer">
            <StatusCard
              title="Dashboard IA"
              value="→"
              subtitle="Métricas e insights"
              icon={TrendingUp}
              variant="info"
            />
          </div>
        </section>

        {/* Métricas Detalhadas */}
        <section>
          <PainelMetricas />
        </section>
        {/* Two Column Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentInteractions items={dados.interacoesRecentes} />
          <AutomationQueue items={dados.automacoesRecentes} />
        </section>

        {/* Connected Systems */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Sistemas Integrados</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {dados.systems.length > 0 ? dados.systems.map((sys) => (
              <div key={sys.name} className="flex items-center gap-2 rounded-lg border bg-secondary/50 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${sys.status === "online" ? "bg-success" : sys.status === "degraded" ? "bg-warning" : "bg-destructive"} animate-pulse`} />
                <div>
                  <span className="text-sm font-medium">{sys.name}</span>
                  <p className="text-xs text-muted-foreground">{sys.latency_ms}ms</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground col-span-4 text-center py-2">
                {dados.loading ? "Conectando..." : "Nenhum sistema conectado"}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
