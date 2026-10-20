import { useState } from "react";
import { LeadCard, Lead } from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { EnvioEmMassaDialog } from "./EnvioEmMassaDialog";
import { compareConversationLeads } from "@/lib/crmLeadOrder";
import { isNeuroMeetingStage } from "@/lib/crmMeeting";
import { MeetingDialog } from "./MeetingDialog";

interface KanbanBoardProps {
  leads: Lead[];
  onRefresh: () => void;
  columns: PipelineColumn[];
  pipelineName: string;
}

export function KanbanBoard({ leads, onRefresh, columns, pipelineName }: KanbanBoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pendingMeeting, setPendingMeeting] = useState<{ leadId: string; chave: string } | null>(null);

  const moveLead = async (leadId: string, chave: string) => {
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
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 280px)" }}>
      {columns.map((col) => {
        const colLeads = leads
          .filter((l) => l.status_pipeline === col.chave)
          .sort(compareConversationLeads);
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
                      <LeadCard lead={lead} onRefresh={onRefresh} columns={columns} onMove={moveLead} pipelineName={pipelineName} />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div></>
  );
}
