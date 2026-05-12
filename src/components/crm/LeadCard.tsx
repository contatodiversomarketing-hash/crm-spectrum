import { useState } from "react";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";
import { Phone, Mail, MapPin, Calendar, FileText, Eye, Pencil, StickyNote, BellRing, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeadEditDialog } from "./LeadEditDialog";

export interface Lead {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  origem: string | null;
  status: string;
  status_pipeline: string;
  dados_triagem?: any;
  observacoes?: string | null;
  criado_em: string;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  pipeline_id?: string | null;
  followup_etapa?: number | null;
  followup_ultimo_envio?: string | null;
  followup_finalizado?: boolean | null;
}

const ETAPA_LABEL: Record<number, { texto: string; tom: string }> = {
  0: { texto: "Aguardando D+1", tom: "bg-muted text-muted-foreground" },
  1: { texto: "1º follow-up enviado (D+1)", tom: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  3: { texto: "2º follow-up enviado (D+3)", tom: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  7: { texto: "3º follow-up — desconto R$10 (D+7)", tom: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  15: { texto: "Último follow-up — desconto R$15 (D+15)", tom: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
}

// Pipeline columns are now dynamic - loaded from DB via usePipelineColumns hook

function formatEndereco(lead: Lead): string | null {
  const parts = [
    lead.logradouro,
    lead.numero ? `nº ${lead.numero}` : null,
    lead.bairro,
    lead.cidade && lead.estado ? `${lead.cidade}/${lead.estado}` : lead.cidade || lead.estado,
    lead.cep ? `CEP ${lead.cep}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function LeadCard({ lead, onRefresh, columns = [] }: { lead: Lead; onRefresh: () => void; columns?: PipelineColumn[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const endereco = formatEndereco(lead);

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <p className="font-semibold text-sm text-foreground truncate flex-1">
            {lead.nome || "Sem nome"}
          </p>
          <div className="flex gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {lead.dados_triagem && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Triagem — {lead.nome || "Sem nome"}</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[400px]">
                    <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap">
                      {JSON.stringify(lead.dados_triagem, null, 2)}
                    </pre>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {lead.telefone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.telefone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.cpf && (
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 shrink-0" />
              <span>CPF: {lead.cpf}</span>
            </div>
          )}
          {lead.data_nascimento && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{new Date(lead.data_nascimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
          )}
          {endereco && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{endereco}</span>
            </div>
          )}
        </div>

        {/* Observações */}
        {lead.observacoes && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-start gap-1.5 text-xs">
              <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
              <p className="text-muted-foreground line-clamp-3 italic">{lead.observacoes}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
          {lead.origem && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {lead.origem}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(lead.criado_em).toLocaleDateString("pt-BR")}
          </span>
        </div>
      </div>

      <LeadEditDialog lead={lead} open={editOpen} onOpenChange={setEditOpen} onSaved={onRefresh} columns={columns} />
    </>
  );
}
