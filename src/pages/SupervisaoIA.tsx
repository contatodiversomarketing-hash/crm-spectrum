import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, CheckCircle, Edit3, UserCheck, Clock, Shield, RefreshCw, ArrowLeft, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Interacao {
  id: string;
  paciente_externo_id: string;
  mensagem_usuario: string | null;
  intencao_detectada: string | null;
  resposta_sugerida: string | null;
  resposta_final: string | null;
  supervisionado: boolean;
  estado_conversa: string | null;
  canal: string;
  criado_em: string;
}

interface ConfigSistema {
  modo_supervisao_ativo: boolean;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string;
}

function estaEmHorarioComercial(config: ConfigSistema): boolean {
  const agora = new Date();
  const brasilOffset = -3 * 60;
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const brasilDate = new Date(utcMs + brasilOffset * 60000);

  const diasMap: Record<string, number> = {
    dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  };
  const diasAtivos = config.dias_semana.split(",").map((d) => diasMap[d.trim()]).filter((d) => d !== undefined);
  if (!diasAtivos.includes(brasilDate.getDay())) return false;

  const [hI, mI] = config.horario_inicio.split(":").map(Number);
  const [hF, mF] = config.horario_fim.split(":").map(Number);
  const mins = brasilDate.getHours() * 60 + brasilDate.getMinutes();
  return mins >= hI * 60 + (mI || 0) && mins <= hF * 60 + (mF || 0);
}

function formatarHoraBrasil(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const SupervisaoIA = () => {
  const [filaPendente, setFilaPendente] = useState<Interacao[]>([]);
  const [historico, setHistorico] = useState<Interacao[]>([]);
  const [config, setConfig] = useState<ConfigSistema | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [horaAtual, setHoraAtual] = useState(formatarHoraBrasil());
  const navigate = useNavigate();
  const { toast } = useToast();

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [pendentesRes, historicoRes, configRes] = await Promise.all([
        supabase
          .from("interacoes_ia")
          .select("*")
          .eq("supervisionado", true)
          .is("resposta_final", null)
          .order("criado_em", { ascending: false }),
        supabase
          .from("interacoes_ia")
          .select("*")
          .order("criado_em", { ascending: false })
          .limit(20),
        supabase
          .from("configuracoes_sistema")
          .select("modo_supervisao_ativo, horario_inicio, horario_fim, dias_semana")
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (pendentesRes.data) setFilaPendente(pendentesRes.data);
      if (historicoRes.data) setHistorico(historicoRes.data);
      if (configRes.data) setConfig(configRes.data);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      toast({ title: "Erro", description: "Falha ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    carregarDados();
    const interval = setInterval(() => setHoraAtual(formatarHoraBrasil()), 30000);
    return () => clearInterval(interval);
  }, [carregarDados]);

  const executarAcao = async (interacaoId: string, acao: "aprovar" | "editar" | "manual", respostaFinal?: string) => {
    setActionLoading(interacaoId);
    try {
      const { data, error } = await supabase.functions.invoke("aprovar-mensagem", {
        body: { interacao_id: interacaoId, acao, resposta_final: respostaFinal },
      });

      if (error) throw error;

      const labels: Record<string, string> = {
        aprovar: "Mensagem aprovada e enviada",
        editar: "Mensagem editada e enviada",
        manual: "Marcado como atendimento manual",
      };

      toast({ title: "Sucesso", description: labels[acao] });
      setEditando(null);
      setTextoEditado("");
      await carregarDados();
    } catch (err) {
      console.error("Erro na ação:", err);
      toast({ title: "Erro", description: `Falha ao executar ação: ${acao}`, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const emHorario = config ? estaEmHorarioComercial(config) : false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Supervisão IA</h1>
              <p className="text-xs text-muted-foreground">Painel de aprovação de respostas</p>
            </div>
          </div>
          <button
            onClick={carregarDados}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Seção 3 — Status do Sistema */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Status do Sistema
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Modo Supervisão</p>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${config?.modo_supervisao_ativo ? "bg-success animate-pulse" : "bg-destructive"}`} />
                <span className="text-sm font-semibold">
                  {config?.modo_supervisao_ativo ? "Ativo" : "Desativado"}
                </span>
              </div>
            </div>
            <div className="rounded-lg border bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Horário Atual (Brasil)</p>
              <span className="text-sm font-semibold">{horaAtual}</span>
            </div>
            <div className="rounded-lg border bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Horário Comercial</p>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${emHorario ? "bg-success animate-pulse" : "bg-warning"}`} />
                <span className="text-sm font-semibold">
                  {emHorario ? "Dentro do horário" : "Fora do horário"}
                </span>
                {config && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({config.horario_inicio}–{config.horario_fim})
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Seção 1 — Fila de Supervisão */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-warning" />
            Fila de Supervisão
            {filaPendente.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-warning/15 text-warning text-xs font-bold">
                {filaPendente.length}
              </span>
            )}
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Carregando...</div>
          ) : filaPendente.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma mensagem pendente de supervisão</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filaPendente.map((item) => (
                <div key={item.id} className="rounded-lg border bg-background p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">{item.paciente_externo_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </p>
                    </div>
                    {item.intencao_detectada && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {item.intencao_detectada}
                      </span>
                    )}
                  </div>

                  <div className="rounded-md bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Mensagem do paciente:</p>
                    <p className="text-sm">{item.mensagem_usuario || "—"}</p>
                  </div>

                  <div className="rounded-md bg-primary/5 border border-primary/10 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Resposta sugerida pela IA:</p>
                    {editando === item.id ? (
                      <textarea
                        value={textoEditado}
                        onChange={(e) => setTextoEditado(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                      />
                    ) : (
                      <p className="text-sm">{item.resposta_sugerida || "—"}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {editando === item.id ? (
                      <>
                        <button
                          onClick={() => executarAcao(item.id, "editar", textoEditado)}
                          disabled={actionLoading === item.id || !textoEditado.trim()}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {actionLoading === item.id ? "Enviando..." : "Enviar Editada"}
                        </button>
                        <button
                          onClick={() => { setEditando(null); setTextoEditado(""); }}
                          className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => executarAcao(item.id, "aprovar")}
                          disabled={actionLoading === item.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success text-success-foreground text-xs font-medium hover:bg-success/90 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          {actionLoading === item.id ? "Enviando..." : "Aprovar e Enviar"}
                        </button>
                        <button
                          onClick={() => { setEditando(item.id); setTextoEditado(item.resposta_sugerida || ""); }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          onClick={() => executarAcao(item.id, "manual")}
                          disabled={actionLoading === item.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-secondary/50 transition-colors disabled:opacity-50"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Atendimento Manual
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Seção 2 — Histórico Recente */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Histórico Recente
          </h2>

          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma interação registrada</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Data</th>
                    <th className="pb-2 pr-4 font-medium">Paciente</th>
                    <th className="pb-2 pr-4 font-medium">Intenção</th>
                    <th className="pb-2 pr-4 font-medium">Modo</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historico.map((item) => (
                    <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(item.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{item.paciente_externo_id.replace("tel:", "")}</td>
                      <td className="py-2.5 pr-4">
                        {item.intencao_detectada && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                            {item.intencao_detectada}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.supervisionado
                            ? "bg-warning/15 text-warning"
                            : "bg-success/15 text-success"
                        }`}>
                          {item.supervisionado ? "Supervisionado" : "Automático"}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {item.resposta_final ? (
                          <span className="text-xs text-success font-medium">Respondido</span>
                        ) : item.supervisionado ? (
                          <span className="text-xs text-warning font-medium">Pendente</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default SupervisaoIA;
