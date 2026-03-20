import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MetricasPainel {
  periodo: { inicio: string; fim: string };
  atendimentos: {
    maria_ia: number;
    rebeka: number;
    maria_rita: number;
    outros_humanos: number;
    sem_resposta: number;
    total: number;
  };
  conversas: {
    total: number;
    leads_novos: number;
    leads_existentes: number;
  };
  especialidades: Array<{ nome: string; total: number }>;
  por_dia: Array<{ dia: string; maria_ia: number; rebeka: number; maria_rita: number; outros_humanos: number; total: number }>;
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
        body: { data_inicio: dataInicio, data_fim: dataFim },
      });
      if (fnErr) throw fnErr;
      setDados(data);
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
