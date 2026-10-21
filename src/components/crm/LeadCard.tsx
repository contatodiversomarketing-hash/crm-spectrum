import { useEffect, useState } from "react";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";
import { BotaoLigar } from "@/contexts/TwilioContext";
import { Phone, Mail, MapPin, Calendar, FileText, Eye, Pencil, StickyNote, BellRing, CheckCircle2, Bell, Baby, GripVertical, MoveRight, MessageCircle, Trash2, Megaphone, Tags } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeadEditDialog } from "./LeadEditDialog";
import { LeadAlertsDialog } from "./LeadAlertsDialog";
import { LeadChatDialog } from "./LeadChatDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getEtiqueta } from "@/lib/etiquetas";
import { useCrmEtiquetas } from "@/hooks/useCrmEtiquetas";
import { EtiquetasPicker } from "./EtiquetasPicker";
import { MeetingDialog } from "./MeetingDialog";
import { isNeuroMeetingStage, isFollowUpStage, meetingLabel } from "@/lib/crmMeeting";

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
  nome_filho?: string | null;
  documentos?: any;
  etiquetas?: string[] | null;
  nao_lidas?: number | null;
  ultima_msg_recebida_em?: string | null;
  reuniao_em?: string | null;
}

const ETAPA_LABEL: Record<number, { texto: string; tom: string }> = {
  0: { texto: "Aguardando D+1", tom: "bg-muted text-muted-foreground" },
  1: { texto: "1º follow-up enviado (D+1)", tom: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  3: { texto: "2º follow-up enviado (D+3)", tom: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  7: { texto: "3º follow-up — desconto R$10 (D+7)", tom: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  15: { texto: "Último follow-up — desconto R$15 (D+15)", tom: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
}

const ORIGENS: { nome: string; descricao: string; detalhe?: string }[] = [
  { nome: "Anúncio (Instagram/Facebook)", descricao: "Veio de anúncio. Anotar qual anúncio, se souber", detalhe: "Qual anúncio? (opcional)" },
  { nome: "Instagram orgânico", descricao: "Viu post, reels ou stories sem ser anúncio" },
  { nome: "Google", descricao: "Achou pelo Google ou Google Maps" },
  { nome: "Indicação", descricao: "Anotar quem indicou e agradecer a essa pessoa depois", detalhe: "Quem indicou?" },
  { nome: "Paciente antigo", descricao: "Já foi atendido antes" },
  { nome: "Palestra ou evento", descricao: "Veio de palestra, aula ou evento", detalhe: "Qual evento? (opcional)" },
  { nome: "Parceiros", descricao: "Escola, terapeuta ou outro profissional indicou", detalhe: "Qual parceiro? (opcional)" },
];

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

export function LeadCard({
  lead,
  onRefresh,
  columns = [],
  onMove,
  pipelineName = "",
  followUpAt,
  onEditFollowUp,
  onInteractionChange,
}: {
  followUpAt?: string;
  onEditFollowUp?: () => void;
  onInteractionChange?: (id: string, active: boolean) => void;
  lead: Lead;
  onRefresh: () => void;
  columns?: PipelineColumn[];
  onMove?: (leadId: string, chave: string) => void;
  pipelineName?: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelSelection, setLabelSelection] = useState<string[]>([]);
  const [savingLabels, setSavingLabels] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const { catalog } = useCrmEtiquetas();
  const meetingStage = isNeuroMeetingStage(pipelineName, columns.find((column) => column.chave === lead.status_pipeline)?.nome ?? "");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [origemOpen, setOrigemOpen] = useState(false);
  const [origemSel, setOrigemSel] = useState<string | null>(null);
  const [origemDetalhe, setOrigemDetalhe] = useState("");
  const [salvandoOrigem, setSalvandoOrigem] = useState(false);
  const interacting = editOpen || chatOpen || labelsOpen || meetingOpen || alertsOpen || origemOpen || deleteOpen;
  useEffect(() => {
    onInteractionChange?.(lead.id, interacting);
    return () => onInteractionChange?.(lead.id, false);
  }, [lead.id, interacting, onInteractionChange]);

  const salvarOrigem = async () => {
    if (!origemSel) return;
    const op = ORIGENS.find((o) => o.nome === origemSel);
    const valor = op?.detalhe && origemDetalhe.trim() ? `${origemSel} — ${origemDetalhe.trim()}` : origemSel;
    setSalvandoOrigem(true);
    const { error } = await supabase.from("leads").update({ origem: valor }).eq("id", lead.id);
    setSalvandoOrigem(false);
    if (error) {
      toast({ title: "Erro ao salvar origem", description: error.message, variant: "destructive" });
      return;
    }
    setOrigemOpen(false);
    toast({ title: "Origem registrada", description: valor });
    onRefresh();
  };


  const excluirLead = async () => {
    setDeleting(true);
    await supabase.from("lead_alertas").delete().eq("lead_id", lead.id);
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setDeleteOpen(false);
    toast({ title: "Lead excluído", description: lead.nome || "Sem nome" });
    onRefresh();
  };
  const endereco = formatEndereco(lead);
  const docCount = Array.isArray(lead.documentos) ? lead.documentos.length : 0;

  return (
    <>
      <div className={`bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing w-full min-w-0 max-w-full overflow-hidden ${(lead.nao_lidas ?? 0) > 0 ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
        <div className="flex flex-col items-stretch gap-1 mb-2">
          <div className="flex items-start gap-1 flex-1 min-w-0">
            <GripVertical className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
            <p className="font-semibold text-sm text-foreground break-words flex-1 min-w-0">
              {(() => {
                const n = (lead.nome || "").trim();
                const valido = n && !/^whatsapp\s/i.test(n) && /[a-zA-ZÀ-ÿ]/.test(n);
                return valido ? n : "Sem nome";
              })()}
            </p>
            {(lead.nao_lidas ?? 0) > 0 && (
              <span className="shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5" title="Mensagens não lidas">
                {lead.nao_lidas} nova{(lead.nao_lidas ?? 0) > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Etiquetas" onClick={() => { setLabelSelection(lead.etiquetas ?? []); setLabelsOpen(true); }}><Tags className="h-3.5 w-3.5" /></Button>
            {onMove && columns.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Mover para coluna">
                    <MoveRight className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {columns.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      disabled={c.chave === lead.status_pipeline}
                      onClick={() => onMove(lead.id, c.chave)}
                    >
                      <span className={`w-2 h-2 rounded-full mr-2 ${c.cor}`} />
                      {c.nome}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setOrigemSel(null); setOrigemDetalhe(""); setOrigemOpen(true); }} title="De onde veio o lead">
              <Megaphone className="h-3.5 w-3.5" />
            </Button>
            <BotaoLigar telefone={lead.telefone ?? ""} nome={lead.nome} leadId={lead.id} />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setChatOpen(true)} title="Conversar no WhatsApp">
              <MessageCircle className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAlertsOpen(true)} title="Lembretes">
              <Bell className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              title="Excluir lead"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)} title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Visualizar">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Detalhes — {lead.nome || "Sem nome"}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-3 text-sm p-1">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Telefone", lead.telefone],
                        ["Email", lead.email],
                        ["CPF", lead.cpf],
                        ["Nascimento", lead.data_nascimento],
                        ["Filho", lead.nome_filho],
                        ["Origem", lead.origem],
                        ["Status", lead.status_pipeline],
                        ["Endereço", endereco],
                      ]
                        .filter(([, v]) => !!v)
                        .map(([k, v]) => (
                          <div key={k as string}>
                            <p className="text-xs text-muted-foreground">{k}</p>
                            <p className="font-medium break-words">{v as string}</p>
                          </div>
                        ))}
                    </div>
                    {lead.observacoes && (
                      <div>
                        <p className="text-xs text-muted-foreground">Observações</p>
                        <p className="whitespace-pre-wrap">{lead.observacoes}</p>
                      </div>
                    )}
                    {docCount > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Documentos</p>
                        <ul className="space-y-1">
                          {lead.documentos.map((d: any, i: number) => (
                            <li key={i} className="truncate">
                              {d?.url ? (
                                <a href={d.url} target="_blank" rel="noreferrer" className="text-primary underline">
                                  {d.nome || `Documento ${i + 1}`}
                                </a>
                              ) : (
                                d?.nome || `Documento ${i + 1}`
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lead.dados_triagem && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Triagem</p>
                        <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap">
                          {JSON.stringify(lead.dados_triagem, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground min-w-0 cursor-pointer" onClick={() => setEditOpen(true)}>
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
          {lead.nome_filho && (
            <div className="flex items-center gap-1.5">
              <Baby className="h-3 w-3 shrink-0" />
              <span className="truncate">Filho: {lead.nome_filho}</span>
            </div>
          )}
          {docCount > 0 && (
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 shrink-0" />
              <span>{docCount} documento{docCount > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Etiquetas */}
        {meetingStage && <div className="mt-2 border-t border-primary/30 pt-2">
          <Button variant="outline" className="w-full h-auto justify-start gap-2 whitespace-normal text-left border-primary/30 bg-primary/10 text-primary" onClick={() => setMeetingOpen(true)} title="Editar data e hora da reunião">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="min-w-0"><span className="block text-xs font-semibold">Reunião agendada</span><span className="block text-xs">{lead.reuniao_em ? meetingLabel(lead.reuniao_em) : "Definir data e hora"}</span></span>
          </Button>
        </div>}
        {onEditFollowUp && isFollowUpStage(columns.find((c) => c.chave === lead.status_pipeline)?.nome ?? "") && <div className="mt-2 border-t border-primary/30 pt-2">
          <Button variant="outline" className={`w-full h-auto justify-start gap-2 whitespace-normal text-left ${followUpAt && Date.parse(followUpAt) <= Date.now() ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}`} onClick={onEditFollowUp} title="Editar data e hora do próximo contato">
            <BellRing className="h-4 w-4 shrink-0" />
            <span className="min-w-0"><span className="block text-xs font-semibold">{followUpAt && Date.parse(followUpAt) <= Date.now() ? "Retomar contato agora" : "Próximo contato"}</span><span className="block text-xs">{followUpAt ? meetingLabel(followUpAt) : "Definir data e hora"}</span></span>
          </Button>
        </div>}
        {Array.isArray(lead.etiquetas) && lead.etiquetas.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lead.etiquetas.map((chave) => {
              const et = catalog.find((item) => item.chave === chave) ?? getEtiqueta(chave);
              return (
                <span
                  key={chave}
                  className={`text-[10px] px-1.5 py-0.5 rounded border break-words whitespace-normal ${et.classe}`}
                >
                  {et.nome}
                </span>
              );
            })}
          </div>
        )}

        {/* Observações */}
        {lead.observacoes && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-start gap-1.5 text-xs">
              <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
              <p className="text-muted-foreground line-clamp-3 italic">{lead.observacoes}</p>
            </div>
          </div>
        )}

        {/* Follow-up Ana */}
        {(lead.followup_etapa !== undefined && lead.followup_etapa !== null) && (
          <div className="mt-2 pt-2 border-t border-border">
            {lead.followup_finalizado ? (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] min-w-0">
                <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                <span className="text-green-700 dark:text-green-400 font-medium">
                  Régua finalizada {(lead.followup_etapa ?? 0) >= 15 ? "(15 dias)" : "(respondeu)"}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] min-w-0">
                <BellRing className="h-3 w-3 text-primary" />
                <span className={`px-1.5 py-0.5 rounded break-words whitespace-normal ${ETAPA_LABEL[lead.followup_etapa ?? 0]?.tom || "bg-muted text-muted-foreground"}`}>
                  {ETAPA_LABEL[lead.followup_etapa ?? 0]?.texto || "—"}
                </span>
                {lead.followup_ultimo_envio && (
                  <span className="text-muted-foreground">
                    {new Date(lead.followup_ultimo_envio).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            )}
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
      <MeetingDialog open={meetingOpen} onOpenChange={setMeetingOpen} value={lead.reuniao_em} onSave={async (date) => {
        const { error } = await supabase.from("leads").update({ reuniao_em: date }).eq("id", lead.id);
        if (error) { toast({ title: "Erro ao salvar reunião", description: error.message, variant: "destructive" }); return false; }
        onRefresh(); return true;
      }} />
      <Dialog open={labelsOpen} onOpenChange={setLabelsOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Etiquetas — {lead.nome || "Sem nome"}</DialogTitle></DialogHeader>
        <EtiquetasPicker value={labelSelection} onChange={setLabelSelection} />
        <Button disabled={savingLabels} onClick={async () => {
          setSavingLabels(true);
          const { error } = await supabase.from("leads").update({ etiquetas: labelSelection }).eq("id", lead.id);
          setSavingLabels(false);
          if (error) { toast({ title: "Erro ao salvar etiquetas", description: error.message, variant: "destructive" }); return; }
          setLabelsOpen(false); onRefresh();
        }}>{savingLabels ? "Salvando..." : "Salvar etiquetas"}</Button>
      </DialogContent></Dialog>
      <LeadAlertsDialog leadId={lead.id} leadName={lead.nome || "Sem nome"} open={alertsOpen} onOpenChange={setAlertsOpen} />
      <LeadChatDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        leadId={lead.id}
        leadNome={lead.nome || "Sem nome"}
        telefone={lead.telefone}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{lead.nome || "Sem nome"}</strong>? Esta ação não pode ser desfeita
              e removerá também os lembretes vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                excluirLead();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={origemOpen} onOpenChange={setOrigemOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>De onde veio {lead.nome || "este lead"}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {ORIGENS.map((o) => (
              <button
                key={o.nome}
                type="button"
                onClick={() => setOrigemSel(o.nome)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  origemSel === o.nome ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{o.nome}</p>
                <p className="text-xs text-muted-foreground">{o.descricao}</p>
              </button>
            ))}
            {origemSel && ORIGENS.find((o) => o.nome === origemSel)?.detalhe && (
              <Input
                placeholder={ORIGENS.find((o) => o.nome === origemSel)?.detalhe}
                value={origemDetalhe}
                onChange={(e) => setOrigemDetalhe(e.target.value)}
              />
            )}
            <Button className="w-full" disabled={!origemSel || salvandoOrigem} onClick={salvarOrigem}>
              {salvandoOrigem ? "Salvando..." : "Salvar origem"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
