import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Pipeline {
  id: string;
  nome: string;
  criado_em: string;
}

export function usePipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("criado_em", { ascending: true });

    if (!error && data) {
      setPipelines(data as Pipeline[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  const addPipeline = async (nome: string) => {
    const { data, error } = await supabase
      .from("pipelines")
      .insert({ nome })
      .select()
      .single();
    if (!error) await fetchPipelines();
    return { data, error };
  };

  const updatePipeline = async (id: string, nome: string) => {
    const { error } = await supabase
      .from("pipelines")
      .update({ nome })
      .eq("id", id);
    if (!error) await fetchPipelines();
    return error;
  };

  const deletePipeline = async (id: string) => {
    const { error } = await supabase
      .from("pipelines")
      .delete()
      .eq("id", id);
    if (!error) await fetchPipelines();
    return error;
  };

  return { pipelines, loading, fetchPipelines, addPipeline, updatePipeline, deletePipeline };
}
