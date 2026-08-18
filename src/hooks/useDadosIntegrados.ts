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
}

interface DadosIntegrados {
  crm: CRMData | null;
  interacoesHoje: number;
  automacoesExecutadas: number;
  taxaSucessoAutomacoes: number;
  supervisoesPendentes: number;
  nivelAutonomia: number;
  interacoesRecentes: Array<{
    id: string;
    paciente: string;
    canal: string;
    intencao: string;
    estado: string;
    criado_em: string;
  }>;
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

      // Somente dados locais — sem integrações externas
      const [leadsRes, interacoesRes, automacoesRes, supervisoesRes, configRes] = await Promise.all([
        supabase.from("leads").select("*").order("criado_em", { ascending: false }).limit(200),
        supabase.from("interacoes_ia").select("*").gte("criado_em", hojeISO).order("criado_em", { ascending: false }).limit(10),
        supabase.from("automacoes").select("*").order("criado_em", { ascending: false }).limit(20),
        supabase.from("interacoes_ia").select("id", { count: "exact" }).eq("supervisionado", false).gte("criado_em", hojeISO),
        supabase.from("configuracoes_sistema").select("*").limit(1).maybeSingle(),
      ]);

      const leads = leadsRes.data || [];
      const novos = leads.filter((l: any) => l.status_pipeline === "novo");
      const fechados = leads.filter((l: any) => ["ganho", "fechado", "consultou"].includes(l.status_pipeline));
      const perdidos = leads.filter((l: any) => l.status_pipeline === "perdido");
      const emAtendimento = leads.length - novos.length - fechados.length - perdidos.length;

      const crmData: CRMData = {
        leads: {
          total: leads.length,
          novos: novos.length,
          lista: leads.slice(0, 10) as any,
        },
        funil: {
          total_leads: leads.length,
          em_atendimento: Math.max(emAtendimento, 0),
          fechados: fechados.length,
          perdidos: perdidos.length,
          taxa_conversao: leads.length ? (fechados.length / leads.length) * 100 : 0,
          taxa_perda: leads.length ? (perdidos.length / leads.length) * 100 : 0,
        },
      };

      const interacoes = interacoesRes.data || [];
      const automacoes = automacoesRes.data || [];
      const automacoesHoje = automacoes.filter(a => a.criado_em >= hojeISO);
      const executadas = automacoesHoje.filter(a => a.status === "enviado" || a.status === "executado");
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
      console.error("Erro ao buscar dados:", err);
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
