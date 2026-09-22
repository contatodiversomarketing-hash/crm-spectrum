import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Pencil, RefreshCw, X, FileText, UserPlus, Copy, ClipboardList, CreditCard, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Agendamento, STATUS_OPTIONS } from "./AgendamentoDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamento: Agendamento | null;
  onEditar: (ag: Agendamento) => void;
  onStatus: (ag: Agendamento, status: string) => void;
  onChanged: () => void;
}

const itemBase =
  "w-full justify-start gap-3 rounded-lg border px-4 py-6 text-sm font-semibold uppercase tracking-wide";

export function AcoesAgendamentoDialog({
  open, onOpenChange, agendamento, onEditar, onStatus, onChanged,
}: Props) {
  const navigate = useNavigate();
  const [mostrarStatus, setMostrarStatus] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  if (!agendamento) return null;
  const ag = agendamento;

  const fechar = () => {
    setMostrarStatus(false);
    setConfirmarExclusao(false);
    onOpenChange(false);
  };

  const buscarTelefone = async () => {
    if (!ag.paciente_id) return null;
    const { data } = await supabase.from("pacientes").select("telefone").eq("id", ag.paciente_id).maybeSingle();
    return data?.telefone ?? null;
  };

  const irParaPaciente = (extra = "") => {
    if (!ag.paciente_id) { toast.error("Este agendamento ainda não tem cadastro de paciente vinculado"); return; }
    fechar();
    navigate(`/pacientes?paciente=${ag.paciente_id}${extra}`);
  };

  const abrirConversa = async () => {
    const tel = await buscarTelefone();
    if (!tel) { toast.error("Paciente sem telefone cadastrado"); return; }
    fechar();
    navigate(`/conversas?telefone=${encodeURIComponent(tel)}`);
  };

  const verFinanceiro = () => {
    fechar();
    navigate(ag.paciente_id ? `/financeiro?paciente=${ag.paciente_id}` : "/financeiro");
  };

  const duplicar = async () => {
    const dt = new Date(ag.data_hora);
    dt.setMinutes(dt.getMinutes() + (ag.duracao_min || 30));
    const { error } = await supabase.from("agendamentos").insert({
      paciente_id: ag.paciente_id ?? null,
      paciente_nome: ag.paciente_nome,
      data_hora: dt.toISOString(),
      tipo: ag.tipo,
      procedimento: ag.procedimento,
      duracao_min: ag.duracao_min,
      status: "agendado",
      observacoes: ag.observacoes,
      profissional: ag.profissional,
      sala: ag.sala,
    });
    if (error) { toast.error("Não foi possível duplicar"); return; }
    toast.success("Agendamento duplicado no horário seguinte");
    fechar();
    onChanged();
  };

  const excluir = async () => {
    const { error } = await supabase.from("agendamentos").delete().eq("id", ag.id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Agendamento excluído");
    fechar();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : fechar())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="font-display text-2xl">O que deseja fazer?</DialogTitle>
          <DialogDescription>
            Paciente: <strong className="text-foreground">{ag.paciente_nome ?? "Sem nome"}</strong>
          </DialogDescription>
        </DialogHeader>

        {confirmarExclusao ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmarExclusao(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={excluir}>
                Excluir
              </Button>
            </div>
          </div>
        ) : mostrarStatus ? (
          <div className="space-y-2">
            {STATUS_OPTIONS.map((s) => (
              <Button key={s.value} variant="outline" className={cn(itemBase)}
                onClick={() => { onStatus(ag, s.value); fechar(); }}>
                {s.label}
              </Button>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => setMostrarStatus(false)}>Voltar</Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            <Button variant="outline" className={cn(itemBase, "border-primary/50 bg-primary/5 text-primary")}
              onClick={() => { fechar(); onEditar(ag); }}>
              <Pencil className="h-4 w-4" /> Alterar o agendamento
            </Button>
            <Button variant="outline" className={cn(itemBase, "border-destructive/30 bg-destructive/5 text-destructive")}
              onClick={() => setMostrarStatus(true)}>
              <RefreshCw className="h-4 w-4" /> Alterar a situação
            </Button>
            <Button className={cn(itemBase, "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => setConfirmarExclusao(true)}>
              <X className="h-4 w-4" /> Excluir o agendamento
            </Button>
            <Button variant="outline" className={cn(itemBase, "border-primary/40 text-primary")}
              onClick={() => irParaPaciente("&aba=prontuario")}>
              <FileText className="h-4 w-4" /> Abrir o prontuário
            </Button>
            <Button className={cn(itemBase, "bg-primary text-primary-foreground hover:bg-primary/90")}
              onClick={() => irParaPaciente()}>
              <UserPlus className="h-4 w-4" /> Cadastro do paciente
            </Button>
            <Button variant="outline" className={cn(itemBase, "border-info/40 bg-info/5 text-info")}
              onClick={duplicar}>
              <Copy className="h-4 w-4" /> Duplicar agendamento
            </Button>
            <Button variant="outline" className={itemBase} onClick={abrirConversa}>
              <ClipboardList className="h-4 w-4" /> Solicitar anamnese
            </Button>
            <Button variant="outline" className={itemBase} onClick={verFinanceiro}>
              <CreditCard className="h-4 w-4" /> Receber do paciente
            </Button>
            <Button variant="outline" className={itemBase} onClick={verFinanceiro}>
              <DollarSign className="h-4 w-4" /> Ver financeiro
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
