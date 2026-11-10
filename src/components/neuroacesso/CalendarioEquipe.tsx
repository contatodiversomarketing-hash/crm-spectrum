import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LockKeyhole, LockKeyholeOpen, Plus, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { agendamentoNeuroSchema, diaBrasilia, dataLocal, horaBrasilia, podeAgendarNeuro, type HorarioNeuro } from "@/lib/neuroacessoAgenda";

type Reuniao = { horario_id: string; nome: string; status: string };
type Props = { horarios: HorarioNeuro[]; reunioes: Reuniao[]; atualizar: () => Promise<void> };

export function CalendarioEquipe({ horarios, reunioes, atualizar }: Props) {
  const [dia, setDia] = useState<Date>(() => new Date(`${diaBrasilia(new Date().toISOString())}T12:00:00`));
  const [selecionado, setSelecionado] = useState<HorarioNeuro | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [alterando, setAlterando] = useState<string | null>(null);
  const doDia = horarios.filter(h => diaBrasilia(h.inicio) === dataLocal(dia));
  async function bloquear(h: HorarioNeuro) {
    setAlterando(h.id);
    const { error } = await supabase.from("neuroacesso_horarios").update({ ativo: !h.ativo }).eq("id", h.id);
    setAlterando(null);
    if (error) { toast.error(error.message); return; }
    toast.success(h.ativo ? "Horário bloqueado no link público" : "Horário liberado");
    await atualizar();
  }
  async function agendar(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const validacao = agendamentoNeuroSchema.safeParse({ nome, telefone, email, horario_id: selecionado.id });
    if (!validacao.success) { toast.error(validacao.error.issues[0]?.message || "Confira os dados"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("neuroacesso_agendar", { p_horario_id: validacao.data.horario_id, p_nome: validacao.data.nome, p_telefone: validacao.data.telefone, p_email: validacao.data.email });
    setBusy(false);
    if (error) { toast.error(error.message); await atualizar(); return; }
    toast.success("Reunião agendada");
    setSelecionado(null); setNome(""); setTelefone(""); setEmail("");
    await atualizar();
  }
  return <section className="space-y-4">
    <h3 className="font-display text-2xl">Calendário</h3>
    <div className="grid gap-6 md:grid-cols-[290px_minmax(0,1fr)]">
      <Calendar mode="single" selected={dia} onSelect={d => { if (d) setDia(d); }} locale={ptBR} className="p-0 pointer-events-auto" modifiers={{ reuniao: d => horarios.some(h => diaBrasilia(h.inicio) === dataLocal(d) && reunioes.some(r => r.horario_id === h.id && r.status === "agendada")) }} modifiersClassNames={{ reuniao: "underline decoration-primary decoration-2 underline-offset-4" }} />
      <div className="min-w-0 space-y-3">
        <h4 className="font-medium">{format(dia, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</h4>
        {!doDia.length && <p className="text-sm text-muted-foreground">Nenhum horário nesta data.</p>}
        {doDia.map(h => {
          const r = reunioes.find(r => r.horario_id === h.id && r.status !== "cancelada");
          const passado = new Date(h.inicio).getTime() <= Date.now();
          return <article key={h.id} aria-label={`Horário ${horaBrasilia(h.inicio)}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0"><p className="font-medium text-sm">{horaBrasilia(h.inicio)}–{horaBrasilia(h.fim)}</p><p className="text-xs text-muted-foreground break-words">{r ? `${r.nome} · ${r.status === "realizada" ? "Realizada" : "Agendada"}` : !h.ativo ? "Bloqueado" : passado ? "Encerrado" : "Livre"}</p></div>
            {!r && !passado && <div className="flex gap-2">
              {h.ativo && <Button size="sm" variant="outline" disabled={!podeAgendarNeuro(h.inicio)} title={!podeAgendarNeuro(h.inicio) ? "Antecedência mínima de 5 horas" : "Agendar reunião"} onClick={() => setSelecionado(h)}><Plus className="h-4 w-4 mr-1" />Agendar</Button>}
              <Button size="icon" variant="outline" disabled={alterando !== null} aria-label={`${h.ativo ? "Bloquear" : "Liberar"} ${horaBrasilia(h.inicio)}`} title={h.ativo ? "Bloquear horário" : "Liberar horário"} onClick={() => void bloquear(h)}>{alterando === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : h.ativo ? <LockKeyhole className="h-4 w-4" /> : <LockKeyholeOpen className="h-4 w-4" />}</Button>
            </div>}
          </article>;
        })}
      </div>
    </div>
    <Dialog open={selecionado !== null} onOpenChange={open => { if (!open && !busy) setSelecionado(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Agendar reunião NeuroAcesso</DialogTitle></DialogHeader>
        {selecionado && <p className="text-sm text-muted-foreground">{format(dia, "dd/MM/yyyy")} · {horaBrasilia(selecionado.inicio)}–{horaBrasilia(selecionado.fim)} · Brasília</p>}
        <form onSubmit={agendar} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="equipe-nome">Nome completo</Label><Input id="equipe-nome" required value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="equipe-telefone">Telefone com DDD</Label><Input id="equipe-telefone" type="tel" required value={telefone} onChange={e => setTelefone(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="equipe-email">E-mail</Label><Input id="equipe-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar reunião</Button>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}