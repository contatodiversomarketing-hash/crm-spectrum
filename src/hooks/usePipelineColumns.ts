import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineColumn {
  id: string;
  chave: string;
  nome: string;
  cor: string;
  ordem: number;
  pipeline_id: string;
}

const COLOR_OPTIONS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-yellow-500",
  "bg-green-500",
  "bg-emerald-600",
  "bg-red-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-gray-500",
];

export { COLOR_OPTIONS };

export function usePipelineColumns(pipelineId: string | null) {
  const [columns, setColumns] = useState<PipelineColumn[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchColumns = useCallback(async () => {
    if (!pipelineId) {
      setColumns([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("pipeline_colunas")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("ordem", { ascending: true });

    if (!error && data) {
      setColumns(data as PipelineColumn[]);
    }
    setLoading(false);
  }, [pipelineId]);

  useEffect(() => {
    setLoading(true);
    fetchColumns();
  }, [fetchColumns]);

  const addColumn = async (nome: string, cor: string) => {
    if (!pipelineId) return { message: "Nenhum pipeline selecionado" };
    const chave = nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const ordem = columns.length;
    const { error } = await supabase
      .from("pipeline_colunas")
      .insert({ chave, nome, cor, ordem, pipeline_id: pipelineId });
    if (!error) await fetchColumns();
    return error;
  };

  const updateColumn = async (id: string, updates: { nome?: string; cor?: string }) => {
    const { error } = await supabase
      .from("pipeline_colunas")
      .update(updates)
      .eq("id", id);
    if (!error) await fetchColumns();
    return error;
  };

  const deleteColumn = async (id: string) => {
    const { error } = await supabase
      .from("pipeline_colunas")
      .delete()
      .eq("id", id);
    if (!error) await fetchColumns();
    return error;
  };

  const reorderColumns = async (ordered: PipelineColumn[]) => {
    setColumns(ordered.map((c, i) => ({ ...c, ordem: i })));
    const results = await Promise.all(
      ordered.map((c, i) => supabase.from("pipeline_colunas").update({ ordem: i }).eq("id", c.id))
    );
    const err = results.find((r) => r.error)?.error;
    await fetchColumns();
    return err ?? null;
  };

  return { columns, loading, fetchColumns, addColumn, updateColumn, deleteColumn, reorderColumns };
}
