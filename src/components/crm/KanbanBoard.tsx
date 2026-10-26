import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LeadCard, Lead } from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { EnvioEmMassaDialog } from "./EnvioEmMassaDialog";
import { compareColumnLeads } from "@/lib/crmLeadOrder";
import { isNeuroMeetingStage, isFollowUpStage } from "@/lib/crmMeeting";
import { MeetingDialog } from "./MeetingDialog";

interface KanbanBoardProps {
  leads: Lead[];
  onRefresh: () => void;
  columns: PipelineColumn[];
  pipelineName: string;
}

export function KanbanBoard({ leads, onRefresh, columns, pipelineName }: KanbanBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [visibleLeads, setVisibleLeads] = useState(leads);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const handleInteraction = useCallback((id: string, active: boolean) => {
    setEditingIds((previous) => {
      const next = new Set(previous);
      if (active) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    if (editingIds.size === 0) setVisibleLeads(leads);
  }, [leads, editingIds]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pendingMeeting, setPendingMeeting] = useState<{ leadId: string; chave: string } | null>(null);

  const [pendingFollowUp, setPendingFollowUp] = useState<{ leadId: string; chave: string } | null>(null);
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const loadFollowUps = async () => {
    const ids = leads.filter((l) => isFollowUpStage(columns.find((c) => c.chave === l.status_pipeline)?.nome ?? "")).map((l) => l.id);
    if (!ids.length) { setFollowUps({}); return; }
    const { data } = await supabase.from("lead_alertas").select("lead_id, lembrar_em").in("lead_id", ids).eq("concluido", false).order("lembrar_em");
    const map: Record<string, string> = {};
    (data || []).forEach((a) => { if (!map[a.lead_id]) map[a.lead_id] = a.lembrar_em; });
    setFollowUps(map);
  };
  useEffect(() => { loadFollowUps(); }, [leads, columns]);
  const moveLead = async (leadId: string, chave: string) => {
    if (isFollowUpStage(columns.find((column) => column.chave === chave)?.nome ?? "")) {
      setPendingFollowUp({ leadId, chave });
      return;
    }
    if (isNeuroMeetingStage(pipelineName, columns.find((column) => column.chave === chave)?.nome ?? "")) {
      setPendingMeeting({ leadId, chave });
      return;
    }
    const { error } = await supabase.from("leads").update({ status_pipeline: chave }).eq("id", leadId);
    if (error) {
      toast({ title: "Erro ao mover lead", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lead movido", description: `Movido para ${columns.find((c) => c.chave === chave)?.nome || chave}` });
    onRefresh();
  };

  return (
    <><MeetingDialog open={pendingMeeting !== null} onOpenChange={(open) => { if (!open) setPendingMeeting(null); }} value={leads.find((lead) => lead.id === pendingMeeting?.leadId)?.reuniao_em} onSave={async (date) => {
      if (!pendingMeeting) return false;
      const { error } = await supabase.from("leads").update({ status_pipeline: pendingMeeting.chave, reuniao_em: date }).eq("id", pendingMeeting.leadId);
      if (error) { toast({ title: "Erro ao agendar reunião", description: error.message, variant: "destructive" }); return false; }
      onRefresh();
      return true;
    }} />
    <MeetingDialog open={pendingFollowUp !== null} onOpenChange={(open) => { if (!open) setPendingFollowUp(null); }} title="Follow-up" label="Quando entrar em contato novamente? (Brasília)" button="Salvar e mover" onSave={async (date) => {
      if (!pendingFollowUp) return false;
      const col = columns.find((c) => c.chave === pendingFollowUp.chave);
      await supabase.from("lead_alertas").update({ concluido: true }).eq("lead_id", pendingFollowUp.leadId).eq("concluido", false).like("titulo", "Retomar contato%");
      const { error } = await supabase.from("leads").update({ status_pipeline: pendingFollowUp.chave }).eq("id", pendingFollowUp.leadId);
      if (error) { toast({ title: "Erro ao mover lead", description: error.message, variant: "destructive" }); return false; }
      const { error: e2 } = await supabase.from("lead_alertas").insert({ lead_id: pendingFollowUp.leadId, titulo: `Retomar contato (${col?.nome ?? "Follow-up"})`, lembrar_em: date });
      if (e2) { toast({ title: "Lead movido, mas o lembrete não foi salvo", description: e2.message, variant: "destructive" }); }
      else toast({ title: "Follow-up agendado", description: "Vamos avisar quando chegar a hora." });
      onRefresh(); loadFollowUps();
      return true;
    }} />
    <div className="relative">
    <button type="button" aria-label="Colunas à esquerda" onClick={() => boardRef.current?.scrollBy({ left: -300, behavior: "smooth" })} className="absolute left-1 top-24 z-30 -translate-y-1/2 rounded-full border border-border bg-background/95 p-2 shadow-md hover:bg-muted">
      <ChevronLeft className="h-5 w-5 text-foreground" />
    </button>
    <button type="button" aria-label="Colunas à direita" onClick={() => boardRef.current?.scrollBy({ left: 300, behavior: "smooth" })} className="absolute right-1 top-24 z-30 -translate-y-1/2 rounded-full border border-border bg-background/95 p-2 shadow-md hover:bg-muted">
      <ChevronRight className="h-5 w-5 text-foreground" />
    </button>
    <div ref={boardRef} className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 280px)" }}>
      {columns.map((col) => {
        const colLeads = visibleLeads
          .filter((l) => l.status_pipeline === col.chave)
          .sort((a, b) => compareColumnLeads(col.nome, a, b));
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.chave);
            }}
            onDragLeave={() => setDragOver((c) => (c === col.chave ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const leadId = e.dataTransfer.getData("text/lead-id");
              const from = e.dataTransfer.getData("text/lead-status");
              if (leadId && from !== col.chave) moveLead(leadId, col.chave);
            }}
            className={`flex-shrink-0 w-[280px] flex flex-col bg-muted/40 rounded-xl border transition-colors ${
              dragOver === col.chave ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <div className={`w-2.5 h-2.5 rounded-full ${col.cor}`} />
              <h3 className="text-sm font-semibold text-foreground">{col.nome}</h3>
              <div className="ml-auto">
                <EnvioEmMassaDialog colunaNome={col.nome} leads={colLeads} />
              </div>
              <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                {colLeads.length}
              </span>
            </div>
            <ScrollArea className="flex-1 p-2 w-full [&>div>div]:!block [&>div>div]:!min-w-0">
              <div className="space-y-2 min-w-0">
                {colLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {dragOver === col.chave ? "Solte aqui" : "Nenhum lead"}
                  </p>
                ) : (
                  colLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="min-w-0"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/lead-id", lead.id);
                        e.dataTransfer.setData("text/lead-status", lead.status_pipeline);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <LeadCard lead={lead} onInteractionChange={handleInteraction} onRefresh={onRefresh} columns={columns} onMove={moveLead} pipelineName={pipelineName} followUpAt={followUps[lead.id]} onEditFollowUp={() => setPendingFollowUp({ leadId: lead.id, chave: lead.status_pipeline })} />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div></div></>
  );
}
