import { useState } from "react";
import { useMetricasPainel } from "@/hooks/useMetricasPainel";
import { Bot, User, MessageSquare, UserPlus, Users, Stethoscope, RefreshCw, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function PainelMetricas() {
  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(formatDate(hoje));
  const [dataFim, setDataFim] = useState(formatDate(hoje));

  const { dados, loading, error, refresh } = useMetricasPainel(dataInicio, dataFim);

  const totalAtend = dados?.atendimentos.total || 0;
  const mariaPercent = totalAtend > 0 ? ((dados?.atendimentos.maria_ia || 0) / totalAtend) * 100 : 0;
  const humanoPercent = totalAtend > 0 ? ((dados?.atendimentos.humanos || 0) / totalAtend) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Filtro de data */}
      <div className="flex items-center gap-3 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-[150px] h-9 text-sm"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-[150px] h-9 text-sm"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        {/* Atalhos */}
        <div className="flex gap-1">
          {[
            { label: "Hoje", fn: () => { setDataInicio(formatDate(hoje)); setDataFim(formatDate(hoje)); } },
            { label: "7d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); setDataInicio(formatDate(d)); setDataFim(formatDate(hoje)); } },
            { label: "30d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); setDataInicio(formatDate(d)); setDataFim(formatDate(hoje)); } },
          ].map((a) => (
            <Button key={a.label} variant="outline" size="sm" className="text-xs h-7 px-2" onClick={a.fn}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Erro ao carregar métricas: {error}
        </div>
      )}

      {/* Cards de atendimento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">MarIA (IA)</span>
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">
            {loading ? "..." : dados?.atendimentos.maria_ia ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {mariaPercent.toFixed(0)}% dos atendimentos
          </p>
          <Progress value={mariaPercent} className="mt-2 h-1.5" />
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Humanos (Maria + Rebeka)</span>
            <User className="h-5 w-5 text-warning" />
          </div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">
            {loading ? "..." : dados?.atendimentos.humanos ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {humanoPercent.toFixed(0)}% dos atendimentos
          </p>
          <Progress value={humanoPercent} className="mt-2 h-1.5" />
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm border-l-4 border-l-success">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Leads Novos</span>
            <UserPlus className="h-5 w-5 text-success" />
          </div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">
            {loading ? "..." : dados?.conversas.leads_novos ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Primeiro contato no período</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm border-l-4 border-l-info">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Conversas Totais</span>
            <Users className="h-5 w-5 text-info" />
          </div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">
            {loading ? "..." : dados?.conversas.total ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {dados?.conversas.leads_existentes ?? 0} já existentes
          </p>
        </div>
      </div>

      {/* Especialidades + Mensagens totais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Especialidades */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Contatos por Especialidade</h3>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : dados?.especialidades && dados.especialidades.length > 0 ? (
            <div className="space-y-3">
              {dados.especialidades.map((esp) => {
                const maxVal = dados.especialidades[0]?.total || 1;
                const pct = (esp.total / maxVal) * 100;
                return (
                  <div key={esp.nome}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{esp.nome}</span>
                      <span className="text-sm font-semibold tabular-nums">{esp.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
          )}
        </div>

        {/* Mensagens por dia */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Mensagens por Dia</h3>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : dados?.por_dia && dados.por_dia.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {dados.por_dia.map((d) => {
                const maxVal = Math.max(...dados.por_dia.map((x) => x.total), 1);
                const pctIA = (d.maria_ia / maxVal) * 100;
                const pctH = (d.humano / maxVal) * 100;
                return (
                  <div key={d.dia} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-[72px] shrink-0 tabular-nums">
                      {d.dia.slice(5).replace("-", "/")}
                    </span>
                    <div className="flex-1 flex h-5 rounded-full overflow-hidden bg-secondary">
                      <div
                        className="h-full bg-primary/70 transition-all duration-500"
                        style={{ width: `${pctIA}%` }}
                        title={`MarIA: ${d.maria_ia}`}
                      />
                      <div
                        className="h-full bg-warning/70 transition-all duration-500"
                        style={{ width: `${pctH}%` }}
                        title={`Humano: ${d.humano}`}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-[40px] text-right">{d.total}</span>
                  </div>
                );
              })}
              <div className="flex gap-4 pt-2 border-t mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                  <span className="text-xs text-muted-foreground">MarIA</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <span className="text-xs text-muted-foreground">Humano</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
          )}
        </div>
      </div>
    </div>
  );
}
