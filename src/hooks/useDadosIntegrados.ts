import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CRMData {
  leads: {
    total: number;
    novos: number;
    lista: Array<{
      id: string;
      nome_completo: string;
      origem: string;
      status: string;
      telefone: string;
      ultima_interacao: string;
    }>;
  };
  funil: {
    total_leads: number;
    em_atendimento: number;
    fechados: number;
    perdidos: number;
    taxa_conversao: number;
    taxa_perda: number;
  };
  oportunidades: {
    abertas: number;
    ganhas: number;
    perdidas: number;
    receita_total: number;
    ticket_medio: number;
    valor_pipeline_aberto: number;
    win_rate: number;
  };
}

interface GestaoData {
  pacientes_inativos: number;
  lista_inativos: Array<{
    id: string;
    nome: string;
    phone: string;
    ultima_consulta: string | null;
    total_consultas: number;
  }>;
}

interface FinanceiroData {
  ok: boolean;
  data: unknown;
}

interface SystemStatus {
  name: string;
  status: "online" | "offline" | "degraded";
  latency_ms: number;
}

interface DadosIntegrados {
  crm: CRMData | null;
  gestao: GestaoData | null;
  financeiro: FinanceiroData | null;
  systems: SystemStatus[];
  // KPIs locais
  interacoesHoje: number;
  automacoesExecutadas: number;
  taxaSucessoAutomacoes: number;
  supervisoesPendentes: number;
  nivelAutonomia: number;
  // Interações recentes
  interacoesRecentes: Array<{
    id: string;
    paciente: string;
    canal: string;
    intencao: string;
    estado: string;
    criado_em: string;
  }>;
  // Automações recentes
  automacoesRecentes: Array<{
    id: string;
    tipo: string;
    sistema: string;
    status: string;
    paciente: string;
  }>;
  loading: boolean;
  error: string | null;
}

export function useDadosIntegrados() {
  const [dados, setDados] = useState<DadosIntegrados>({
    crm: null,
    gestao: null,
    financeiro: null,
    systems: [],
    interacoesHoje: 0,
    automacoesExecutadas: 0,
    taxaSucessoAutomacoes: 0,
    supervisoesPendentes: 0,
    nivelAutonomia: 50,
    interacoesRecentes: [],
    automacoesRecentes: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setDados(prev => ({ ...prev, loading: true, error: null }));

    try {
      const hojeInicio = new Date();
      hojeInicio.setHours(0, 0, 0, 0);
      const hojeISO = hojeInicio.toISOString();

      // Fetch integrados + dados locais em paralelo
      const [integradosRes, interacoesRes, automacoesRes, supervisoesRes, configRes] = await Promise.all([
        supabase.functions.invoke("coletar-dados-integrados"),
        supabase.from("interacoes_ia").select("*").gte("criado_em", hojeISO).order("criado_em", { ascending: false }).limit(10),
        supabase.from("automacoes").select("*").order("criado_em", { ascending: false }).limit(20),
        supabase.from("interacoes_ia").select("id", { count: "exact" }).eq("supervisionado", false).gte("criado_em", hojeISO),
        supabase.from("configuracoes_sistema").select("*").limit(1).single(),
      ]);

      // Parse dados integrados
      const integrados = integradosRes.data;
      const systems: SystemStatus[] = [];

      let crmData: CRMData | null = null;
      if (integrados?.crm) {
        const leadsOk = integrados.crm.leads?.ok;
        const conversoesOk = integrados.crm.conversoes?.ok;
        const avgLatency = Math.round(
          ((integrados.crm.leads?.duration_ms || 0) + (integrados.crm.conversoes?.duration_ms || 0)) / 2
        );

        systems.push({
          name: "CRM",
          status: leadsOk && conversoesOk ? "online" : "degraded",
          latency_ms: avgLatency,
        });

        if (leadsOk || conversoesOk) {
          const leadsData = integrados.crm.leads?.data || {};
          const conversoesData = integrados.crm.conversoes?.data || {};
          crmData = {
            leads: {
              total: leadsData.leads?.length || 0,
              novos: leadsData.leads?.filter((l: any) => l.status === "novo")?.length || 0,
              lista: (leadsData.leads || []).slice(0, 10),
            },
            funil: conversoesData.funil || { total_leads: 0, em_atendimento: 0, fechados: 0, perdidos: 0, taxa_conversao: 0, taxa_perda: 0 },
            oportunidades: conversoesData.oportunidades || { abertas: 0, ganhas: 0, perdidas: 0, receita_total: 0, ticket_medio: 0, valor_pipeline_aberto: 0, win_rate: 0 },
          };
        }
      }

      let gestaoData: GestaoData | null = null;
      if (integrados?.gestao) {
        systems.push({
          name: "Gestão",
          status: integrados.gestao.ok ? "online" : "offline",
          latency_ms: integrados.gestao.duration_ms || 0,
        });
        if (integrados.gestao.ok) {
          const gData = integrados.gestao.data || {};
          gestaoData = {
            pacientes_inativos: gData.count || 0,
            lista_inativos: (gData.patients || []).slice(0, 10),
          };
        }
      }

      let financeiroData: FinanceiroData | null = null;
      if (integrados?.financeiro) {
        systems.push({
          name: "Financeiro",
          status: integrados.financeiro.ok ? "online" : "offline",
          latency_ms: integrados.financeiro.duration_ms || 0,
        });
        financeiroData = {
          ok: integrados.financeiro.ok,
          data: integrados.financeiro.data,
        };
      }

      // Dados locais
      const interacoes = interacoesRes.data || [];
      const automacoes = automacoesRes.data || [];
      const automacoesHoje = automacoes.filter(a => a.criado_em >= hojeISO);
      const executadas = automacoesHoje.filter(a => a.status === "enviado" || a.status === "executado");
      const falhas = automacoesHoje.filter(a => a.status === "falha");
      const taxaSucesso = automacoesHoje.length > 0
        ? ((executadas.length / automacoesHoje.length) * 100)
        : 100;

      const interacoesRecentes = interacoes.map(i => ({
        id: i.id,
        paciente: i.paciente_externo_id,
        canal: i.canal,
        intencao: i.intencao_detectada || "—",
        estado: i.resposta_final ? "concluído" : i.supervisionado ? "supervisionado" : "em andamento",
        criado_em: i.criado_em,
      }));

      const automacoesRecentes = automacoes.slice(0, 6).map(a => ({
        id: a.id,
        tipo: a.tipo,
        sistema: a.sistema_alvo,
        status: a.status === "enviado" || a.status === "executado" ? "executado" : a.status === "falha" ? "falha" : "pendente",
        paciente: a.paciente_externo_id,
      }));

      setDados({
        crm: crmData,
        gestao: gestaoData,
        financeiro: financeiroData,
        systems,
        interacoesHoje: interacoes.length,
        automacoesExecutadas: executadas.length,
        taxaSucessoAutomacoes: taxaSucesso,
        supervisoesPendentes: supervisoesRes.count || 0,
        nivelAutonomia: configRes.data?.nivel_autonomia || 50,
        interacoesRecentes,
        automacoesRecentes,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("Erro ao buscar dados integrados:", err);
      setDados(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Erro ao buscar dados",
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...dados, refresh: fetchData };
}
