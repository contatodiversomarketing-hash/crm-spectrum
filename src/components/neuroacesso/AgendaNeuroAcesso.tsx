import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Copy, ExternalLink, Plus, Trash2, RefreshCw, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { LINK_AGENDA_NEURO, dataBrasilia, horaBrasilia, inicioBrasilia, dataLocal, type HorarioNeuro } from "@/lib/neuroacessoAgenda";

type Reuniao = { id: string; horario_id: string; nome: string; telefone: string; email: string; status: string };
export function AgendaNeuroAcesso() {
  const [horarios, setHorarios] = useState<HorarioNeuro[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [data, setData] = useState<Date>();
  const [hora, setHora] = useState("");
  const [fim, setFim] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  async function carregar() {
    const [h, r] = await Promise.all([
      supabase.from("neuroacesso_horarios").select("*").order("inicio"),
      supabase.from("neuroacesso_reunioes").select("*").order("criado_em", { ascending: false }),
    ]);
    setLoading(false);
    if (h.error || r.error) { setErro("Não foi possível carregar a agenda."); return; }
    setErro(""); setHorarios(h.data || []); setReunioes(r.data || []);
  }
  useEffect(() => { void carregar(); }, []);
  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !hora || !fim || fim <= hora) { toast.error("Escolha data, início e término válidos"); return; }
    const inicio = inicioBrasilia(dataLocal(data), hora);
    if (new Date(inicio).getTime() <= Date.now()) { toast.error("Escolha um horário futuro"); return; }
    setBusy(true);
    const { error } = await supabase.from("neuroacesso_horarios").insert({ inicio, fim: inicioBrasilia(dataLocal(data), fim) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Horário disponibilizado"); await carregar();
  }
  async function remover(id: string) {
    if (!confirm("Retirar este horário do link público?")) return;
    const { error } = await supabase.from("neuroacesso_horarios").update({ ativo: false }).eq("id", id);
    if (error) { toast.error("Não foi possível retirar o horário"); return; }
    await carregar();
  }
  async function status(r: Reuniao, novo: string) {
    if (novo === "cancelada" && !confirm(`Cancelar a reunião de ${r.nome}? O horário ficará disponível novamente.`)) return;
    const { error } = await supabase.from("neuroacesso_reunioes").update({ status: novo }).eq("id", r.id);
    if (error) { toast.error("Não foi possível atualizar a reunião"); return; }
    toast.success(novo === "realizada" ? "Reunião concluída" : "Reunião cancelada"); await carregar();
  }
  const reservas = [...reunioes].sort((a, b) => (horarios.find(h => h.id === a.horario_id)?.inicio || "").localeCompare(horarios.find(h => h.id === b.horario_id)?.inicio || ""));
  const livres = horarios.filter(h => h.ativo && new Date(h.inicio).getTime() > Date.now() && !reunioes.some(r => r.horario_id === h.id && r.status !== "cancelada"));
  return <div className="space-y-7 pt-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-display text-3xl">Agenda NeuroAcesso</h2><p className="text-sm text-muted-foreground">Reuniões · horário de Brasília</p></div>
      <Button variant="outline" size="icon" aria-label="Atualizar agenda" title="Atualizar agenda" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
    </div>
    <div className="flex flex-wrap gap-2 items-center border-y py-4">
      <span className="text-sm font-medium w-full">Link de agendamento</span>
      <code className="flex-1 min-w-0 break-all text-xs text-muted-foreground">{LINK_AGENDA_NEURO}</code>
      <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(LINK_AGENDA_NEURO); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar o link"); } }}><Copy className="h-4 w-4 mr-2" />Copiar</Button>
      <Button variant="outline" asChild><a href="/agendar/neuroacesso" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Abrir</a></Button>
    </div>
    <section className="space-y-4">
      <h3 className="font-display text-2xl">Disponibilizar horário</h3>
      <form onSubmit={publicar} className="flex flex-wrap gap-3 items-end">
        <div className="space-y-2"><Label>Data</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-[210px] justify-start"><CalendarDays className="mr-2 h-4 w-4" />{data ? format(data, "dd 'de' MMMM", { locale: ptBR }) : "Escolher data"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={data} onSelect={setData} locale={ptBR} disabled={(d) => dataLocal(d) < dataLocal(new Date())} className="pointer-events-auto" /></PopoverContent></Popover></div>
        <div className="space-y-2"><Label htmlFor="neuro-inicio">Início</Label><Input id="neuro-inicio" required type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-32" /></div>
        <div className="space-y-2"><Label htmlFor="neuro-fim">Término</Label><Input id="neuro-fim" required type="time" value={fim} onChange={e => setFim(e.target.value)} className="w-32" /></div>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Disponibilizar</Button>
      </form>
      {livres.length > 0 && <div className="flex flex-wrap gap-2">{livres.map(h => <div key={h.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><span>{dataBrasilia(h.inicio)} · {horaBrasilia(h.inicio)}–{horaBrasilia(h.fim)}</span><Button size="icon" variant="ghost" aria-label={`Retirar horário ${horaBrasilia(h.inicio)}`} title="Retirar horário" onClick={() => remover(h.id)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}
      {!loading && !erro && !livres.length && <p className="text-sm text-muted-foreground">Nenhum horário livre publicado.</p>}
    </section>
    <section className="space-y-4 border-t pt-5"><h3 className="font-display text-2xl">Reuniões agendadas</h3>
      {loading ? <p className="text-muted-foreground">Carregando agenda…</p> : erro ? <p role="alert" className="text-destructive">{erro}</p> : !reservas.length ? <p className="text-sm text-muted-foreground">Nenhuma reunião agendada ainda.</p> : <div className="space-y-3">{reservas.map(r => {
        const h = horarios.find(h => h.id === r.horario_id);
        return <article key={r.id} className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 space-y-1"><p className="font-medium break-words">{r.nome}</p><p className="text-sm text-primary">{h && `${dataBrasilia(h.inicio)} · ${horaBrasilia(h.inicio)}–${horaBrasilia(h.fim)}`}</p><p className="text-xs text-muted-foreground break-all">{r.telefone} · {r.email}</p></div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{r.status === "agendada" ? "Agendada" : r.status === "cancelada" ? "Cancelada" : "Realizada"}</span>{r.status === "agendada" && <><Button size="icon" variant="outline" title="Marcar como realizada" aria-label={`Concluir reunião de ${r.nome}`} onClick={() => status(r, "realizada")}><Check className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="Cancelar reunião" aria-label={`Cancelar reunião de ${r.nome}`} onClick={() => status(r, "cancelada")}><X className="h-4 w-4" /></Button></>}</div>
        </article>;
      })}</div>}
    </section>
  </div>;
}