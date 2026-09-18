import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export interface Agendamento {
  id: string;
  data_hora: string;
  status: string;
  paciente_id?: string | null;
  paciente_nome: string | null;
  tipo: string;
  procedimento: string | null;
  duracao_min: number;
  sala: string | null;
  profissional: string | null;
  observacoes: string | null;
}

export const STATUS_OPTIONS = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "presente", label: "Presente" },
  { value: "atendido", label: "Atendido" },
  { value: "cancelada_paciente", label: "Cancelada pelo paciente" },
  { value: "cancelada_clinica", label: "Cancelada pela clínica" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamento: Agendamento | null;
  defaultDate: Date;
  defaultTime?: string;
  profissional: string;
  sala: string;
  onSaved: () => void;
}

export function AgendamentoDialog({
  open,
  onOpenChange,
  agendamento,
  defaultDate,
  defaultTime,
  profissional,
  sala,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [hora, setHora] = useState("09:00");
  const [tipo, setTipo] = useState("Consulta");
  const [procedimento, setProcedimento] = useState("Consulta");
  const [duracao, setDuracao] = useState("30");
  const [status, setStatus] = useState("agendado");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    if (agendamento) {
      const d = new Date(agendamento.data_hora);
      setNome(agendamento.paciente_nome ?? "");
      setHora(d.toTimeString().slice(0, 5));
      setTipo(agendamento.tipo || "Consulta");
      setProcedimento(agendamento.procedimento ?? "Consulta");
      setDuracao(String(agendamento.duracao_min ?? 30));
      setStatus(agendamento.status || "agendado");
      setObs(agendamento.observacoes ?? "");
    } else {
      setNome("");
      setHora(defaultTime ?? "09:00");
      setTipo("Consulta");
      setProcedimento("Consulta");
      setDuracao("30");
      setStatus("agendado");
      setObs("");
    }
  }, [open, agendamento, defaultTime]);

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do paciente");
      return;
    }
    setSaving(true);
    const [h, m] = hora.split(":").map(Number);
    const dt = new Date(defaultDate);
    dt.setHours(h, m, 0, 0);

    const payload = {
      paciente_nome: nome.trim(),
      data_hora: dt.toISOString(),
      tipo,
      procedimento: procedimento || null,
      duracao_min: Number(duracao) || 30,
      status,
      observacoes: obs || null,
      profissional,
      sala,
    };

    const { error } = agendamento
      ? await supabase.from("agendamentos").update(payload).eq("id", agendamento.id)
      : await supabase.from("agendamentos").insert(payload);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success(agendamento ? "Agendamento atualizado" : "Agendamento criado");
    onOpenChange(false);
    onSaved();
  };

  const excluir = async () => {
    if (!agendamento) return;
    const { error } = await supabase.from("agendamentos").delete().eq("id", agendamento.id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Agendamento excluído");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {agendamento ? "Editar agendamento" : "Novo agendamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Paciente</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do paciente" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input type="number" min={10} step={5} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="Consulta">Consulta</SelectItem>
                  <SelectItem value="Teleconsulta">Teleconsulta</SelectItem>
                  <SelectItem value="Retorno">Retorno</SelectItem>
                  <SelectItem value="Encaixe">Encaixe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Procedimento</Label>
              <Input value={procedimento} onChange={(e) => setProcedimento(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {agendamento ? (
            <Button variant="ghost" onClick={excluir} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
