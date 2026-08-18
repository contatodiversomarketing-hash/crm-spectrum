import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, FileText, Phone, Calendar, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ColumnSettingsDialog } from "@/components/crm/ColumnSettingsDialog";
import { PipelineSelector } from "@/components/crm/PipelineSelector";
import { usePipelineColumns } from "@/hooks/usePipelineColumns";
import { usePipelines } from "@/hooks/usePipelines";
import { NewLeadDialog } from "@/components/crm/NewLeadDialog";
import type { Lead } from "@/components/crm/LeadCard";

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  const { pipelines, loading: pipelinesLoading, addPipeline, updatePipeline, deletePipeline } = usePipelines();
  const { columns, loading: colsLoading, addColumn, updateColumn, deleteColumn, reorderColumns } =
    usePipelineColumns(activePipelineId);

  // Auto-select first pipeline
  useEffect(() => {
    if (!activePipelineId && pipelines.length > 0) {
      setActivePipelineId(pipelines[0].id);
    }
    // If active was deleted, reset
    if (activePipelineId && pipelines.length > 0 && !pipelines.find((p) => p.id === activePipelineId)) {
      setActivePipelineId(pipelines[0].id);
    }
  }, [pipelines, activePipelineId]);

  useEffect(() => {
    if (activePipelineId) fetchLeads();
  }, [activePipelineId]);

  const fetchLeads = async () => {
    if (!activePipelineId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("pipeline_id", activePipelineId)
      .order("criado_em", { ascending: false })
      .limit(500);

    if (!error && data) {
      setLeads(data as Lead[]);
    }
    setLoading(false);
  };

  const filteredLeads = leads.filter((lead) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (lead.nome || "").toLowerCase().includes(s) ||
      (lead.telefone || "").includes(s) ||
      (lead.email || "").toLowerCase().includes(s) ||
      (lead.cpf || "").includes(s)
    );
  });

  const stats = {
    total: leads.length,
    triagens: leads.filter((l) => l.status_pipeline === "triagem_recebida").length,
    agendados: leads.filter((l) => l.status_pipeline === "agendado").length,
    emContato: leads.filter((l) => l.status_pipeline === "em_contato").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM — Pipeline</h1>
          <p className="text-sm text-muted-foreground">Gerencie múltiplas pipelines de leads</p>
        </div>
        <div className="flex items-center gap-2">
          <NewLeadDialog pipelineId={activePipelineId} columns={columns} onCreated={fetchLeads} />
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} disabled={!activePipelineId}>
            <Settings className="h-4 w-4 mr-1.5" />
            Colunas
          </Button>
        </div>
      </div>

      {/* Pipeline tabs */}
      {!pipelinesLoading && (
        <PipelineSelector
          pipelines={pipelines}
          activePipelineId={activePipelineId}
          onSelect={setActivePipelineId}
          onAdd={addPipeline}
          onUpdate={updatePipeline}
          onDelete={deletePipeline}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{stats.triagens}</p>
              <p className="text-xs text-muted-foreground">Triagens</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{stats.emContato}</p>
              <p className="text-xs text-muted-foreground">Em Contato</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats.agendados}</p>
              <p className="text-xs text-muted-foreground">Agendados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone, email ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Kanban */}
      {loading || colsLoading || pipelinesLoading ? (
        <p className="text-center text-muted-foreground py-12">Carregando...</p>
      ) : (
        <KanbanBoard leads={filteredLeads} onRefresh={fetchLeads} columns={columns} />
      )}

      <ColumnSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        columns={columns}
        onAdd={addColumn}
        onUpdate={updateColumn}
        onDelete={deleteColumn}
      />
    </div>
  );
}
