import { useEffect, useState } from "react";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import logo from "@/assets/logo-amelia.png";
import { agendamentoNeuroSchema, diaBrasilia, horaBrasilia, dataBrasilia, dataLocal, podeAgendarNeuro, type HorarioNeuro } from "@/lib/neuroacessoAgenda";

export default function AgendarNeuroAcesso() {
  const [horarios, setHorarios] = useState<HorarioNeuro[]>([]);
  const [dia, setDia] = useState<Date>();
  const [selecionado, setSelecionado] = useState<HorarioNeuro>();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmado, setConfirmado] = useState<HorarioNeuro>();
  const [agora, setAgora] = useState(Date.now());
  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase.rpc("neuroacesso_disponibilidade");
    setLoading(false);
    if (error) { setErro("Não foi possível consultar os horários. Tente novamente."); return; }
    setHorarios(data || []);
  }
  useEffect(() => { void carregar(); }, []);
  useEffect(() => { const timer = window.setInterval(() => setAgora(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  async function agendar(e: React.FormEvent) {
    e.preventDefault(); setErro("");
    const result = agendamentoNeuroSchema.safeParse({ nome, telefone, email, horario_id: selecionado?.id });
    if (!result.success) { setErro(result.error.issues[0]?.message || "Confira seus dados e escolha um horário"); return; }
    if (!selecionado || !podeAgendarNeuro(selecionado.inicio)) { setErro("Escolha um horário com pelo menos 5 horas de antecedência."); setSelecionado(undefined); return; }
    setBusy(true);
    const { error } = await supabase.rpc("neuroacesso_agendar", { p_horario_id: result.data.horario_id, p_nome: result.data.nome, p_telefone: result.data.telefone, p_email: result.data.email });
    setBusy(false);
    if (error) { setErro(error.message); setSelecionado(undefined); await carregar(); return; }
    setConfirmado(selecionado);
  }
  const horariosValidos = horarios.filter(h => podeAgendarNeuro(h.inicio, agora));
  const dias = new Set(horariosValidos.map(h => diaBrasilia(h.inicio)));
  const disponiveis = horariosValidos.filter(h => dia && diaBrasilia(h.inicio) === dataLocal(dia));
  const primeiro = horariosValidos[0] ? new Date(`${diaBrasilia(horariosValidos[0].inicio)}T12:00:00`) : new Date();
  return <div className="min-h-screen bg-background">
    <header className="border-b"><div className="max-w-5xl mx-auto px-5 py-5 flex items-center gap-3"><img src={logo} alt="Dra. Amélia Carvalho" className="w-12 h-12 object-contain" /><div><p className="font-display text-2xl">Dra. Amélia Carvalho</p><p className="text-xs text-muted-foreground">Método NeuroAcesso</p></div></div></header>
    <main className="max-w-5xl mx-auto px-5 py-10 sm:py-14">
      {confirmado ? <section className="max-w-xl mx-auto py-10 text-center space-y-5"><CheckCircle2 className="h-14 w-14 text-primary mx-auto" /><h1 className="font-display text-4xl">Reunião agendada</h1><p className="text-lg">{nome.trim()}, seu encontro NeuroAcesso está confirmado.</p><div className="border-y py-5 space-y-2"><p className="font-medium">{dataBrasilia(confirmado.inicio)}</p><p>{horaBrasilia(confirmado.inicio)}–{horaBrasilia(confirmado.fim)} · Horário de Brasília</p></div><p className="text-muted-foreground text-sm">Seu agendamento foi registrado para a equipe da Dra. Amélia.</p></section> : <>
        <div className="mb-10 space-y-3"><p className="text-xs uppercase text-accent">Encontro com a equipe</p><h1 className="font-display text-4xl sm:text-5xl">Agenda NeuroAcesso</h1><p className="text-muted-foreground">Um encontro para conversar sobre o Método NeuroAcesso e sua clínica.</p></div>
        <form onSubmit={agendar} className="grid md:grid-cols-2 gap-8 md:gap-12">
          <section className="space-y-5 min-w-0"><h2 className="font-display text-2xl flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Dia e horário</h2><p className="text-xs text-muted-foreground">Horário de Brasília (UTC−3)</p>
            {loading ? <p className="text-muted-foreground">Consultando horários…</p> : horariosValidos.length === 0 ? <div className="border-y py-6 space-y-3"><p className="text-muted-foreground">Nenhum horário disponível no momento.</p><Button variant="outline" type="button" onClick={() => { setErro(""); void carregar(); }}>Consultar novamente</Button></div> : <>
              <Calendar key={primeiro.toISOString().slice(0, 7)} mode="single" selected={dia} defaultMonth={primeiro} onSelect={d => { setDia(d); setSelecionado(undefined); }} disabled={d => !dias.has(dataLocal(d))} locale={ptBR} className="pointer-events-auto w-fit max-w-full border rounded-lg" />
              {dia && <div className="space-y-3"><p className="text-sm font-medium">Horários disponíveis</p><div className="grid grid-cols-3 gap-2">{disponiveis.map(h => <Button key={h.id} type="button" variant={selecionado?.id === h.id ? "default" : "outline"} aria-pressed={selecionado?.id === h.id} onClick={() => setSelecionado(h)}><Clock className="mr-2 h-3.5 w-3.5" />{horaBrasilia(h.inicio)}</Button>)}</div></div>}
            </>}
          </section>
          <section className="space-y-5 md:border-l md:pl-10 min-w-0"><h2 className="font-display text-2xl">Seus dados</h2>
            <div className="space-y-2"><Label htmlFor="neuro-nome">Nome completo</Label><Input id="neuro-nome" autoComplete="name" maxLength={150} required value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome e sobrenome" className="h-12" /></div>
            <div className="space-y-2"><Label htmlFor="neuro-telefone">Telefone com DDD</Label><Input id="neuro-telefone" type="tel" autoComplete="tel" maxLength={30} required value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" className="h-12" /></div>
            <div className="space-y-2"><Label htmlFor="neuro-email">E-mail</Label><Input id="neuro-email" type="email" autoComplete="email" maxLength={255} required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" className="h-12" /></div>
            {selecionado && <div className="border-y py-4 text-sm space-y-1"><p className="font-medium">{dataBrasilia(selecionado.inicio)}</p><p className="text-muted-foreground">{horaBrasilia(selecionado.inicio)}–{horaBrasilia(selecionado.fim)} · Brasília</p></div>}
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <Button size="lg" type="submit" disabled={busy || !selecionado} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}Confirmar reunião</Button>
          </section>
        </form>
      </>}
    </main>
    <footer className="max-w-5xl mx-auto px-5 py-8 text-xs text-muted-foreground border-t">Dra. Amélia Carvalho · Cuidado que entende. Tratamento que transforma.</footer>
  </div>;
}