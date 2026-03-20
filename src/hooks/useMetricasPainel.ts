import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MetricasPainel {
  periodo: { inicio: string; fim: string };
  atendimentos: {
    maria_ia: number;
    humanos: number;
    sem_resposta: number;
    total: number;
  };
  conversas: {
    total: number;
    leads_novos: number;
    leads_existentes: number;
  };
  especialidades: Array<{ nome: string; total: number }>;
  por_dia: Array<{ dia: string; maria_ia: number; humano: number; total: number }>;
}

export function useMetricasPainel(dataInicio: string, dataFim: string) {
  const [dados, setDados] = useState<MetricasPainel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("metricas-painel", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: null,
      });

      // Edge function GET with query params not supported via invoke, use fetch
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/metricas-painel?data_inicio=${dataInicio}&data_fim=${dataFim}`;
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDados(json);
    } catch (err) {
      console.error("Erro ao buscar métricas:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { dados, loading, error, refresh: fetchData };
}
