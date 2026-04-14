import { LeadCard, Lead } from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";

interface KanbanBoardProps {
  leads: Lead[];
  onRefresh: () => void;
  columns: PipelineColumn[];
}

export function KanbanBoard({ leads, onRefresh, columns }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 280px)" }}>
      {columns.map((col) => {
        const colLeads = leads.filter((l) => l.status_pipeline === col.chave);
        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-[280px] flex flex-col bg-muted/40 rounded-xl border border-border"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <div className={`w-2.5 h-2.5 rounded-full ${col.cor}`} />
              <h3 className="text-sm font-semibold text-foreground">{col.nome}</h3>
              <span className="ml-auto text-xs font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                {colLeads.length}
              </span>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {colLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>
                ) : (
                  colLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onRefresh={onRefresh} />)
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}
