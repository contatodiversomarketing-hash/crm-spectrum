import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfDay, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search, ChevronLeft, ChevronRight, Plus, UserCheck, Building2, Ban, FileText,
  CalendarDays, Users, Pencil, MoreVertical, User, ArrowLeft, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgendamentoDialog, Agendamento, STATUS_OPTIONS } from "@/components/agenda/AgendamentoDialog";

const HORA_INICIO = 9;
const HORA_FIM = 14.75; // 14:45
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const DIAS_ATIVOS = [2, 3, 5]; // Ter, Qua, Sex
const PROFISSIONAL = "Amélia Carvalho";
const SALA = "Consultório 01";

const statusMeta: Record<string, { label: string; className: string; dot: string }> = {
  agendado: { label: "AGENDADO", className: "border-info text-info bg-info/10", dot: "bg-info" },
  confirmado: { label: "CONFIRMADO", className: "border-warning text-warning-foreground bg-warning/20", dot: "bg-warning" },
  presente: { label: "PRESENTE", className: "border-success bg-success text-success-foreground", dot: "bg-success" },
  atendido: { label: "ATENDIDO", className: "border-success text-success bg-success/10", dot: "bg-success" },
  cancelada_paciente: { label: "CANCELADA PELO PACIENTE", className: "border-accent text-accent bg-accent/10", dot: "bg-accent" },
  cancelada_clinica: { label: "CANCELADA PELA CLÍNICA", className: "border-destructive text-destructive bg-destructive/10", dot: "bg-destructive" },
};

function slotsDoDia() {
  const out: string[] = [];
  for (let h = HORA_INICIO; h <= HORA_FIM; h += 0.5) {
    const hh = Math.floor(h);
    const mm = h % 1 === 0 ? "00" : "30";
    out.push(`${String(hh).padStart(2, "0")}:${mm}`);
  }
  return out;
}

export default function Agenda() {
  const [data, setData] = useState<Date>(startOfDay(new Date()));
  const [mes, setMes] = useState<Date>(startOfDay(new Date()));
  const [itens, setItens] = useState<Agendamento[]>([]);
  const [mesItens, setMesItens] = useState<Agendamento[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [modoCalendario, setModoCalendario] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Agendamento | null>(null);
  const [horaPadrao, setHoraPadrao] = useState<string | undefined>();

  const carregar = useCallback(async () => {
    setLoading(true);
    const inicioMes = startOfMonth(mes);
    const fimMes = addDays(endOfMonth(mes), 1);
    const { data: rows, error } = await supabase
      .from("agendamentos")
      .select("id, data_hora, status, paciente_id, paciente_nome, tipo, procedimento, duracao_min, sala, profissional, observacoes")
      .gte("data_hora", inicioMes.toISOString())
      .lt("data_hora", fimMes.toISOString())
      .order("data_hora");
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar agenda");
      return;
    }
    setMesItens((rows ?? []) as Agendamento[]);
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    setItens(mesItens.filter((a) => isSameDay(new Date(a.data_hora), data)));
  }, [mesItens, data]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((a) =>
      (a.paciente_nome ?? "").toLowerCase().includes(q) ||
      (a.procedimento ?? "").toLowerCase().includes(q));
  }, [itens, busca]);

  const contagem = useMemo(() => {
    const c = { agendado: 0, confirmado: 0, presente: 0, atendido: 0 };
    itens.forEach((a) => { if (a.status in c) (c as Record<string, number>)[a.status]++; });
    return c;
  }, [itens]);

  const linhas = useMemo(() => {
    const ocupados = new Map<string, Agendamento[]>();
    filtrados.forEach((a) => {
      const k = format(new Date(a.data_hora), "HH:mm");
      ocupados.set(k, [...(ocupados.get(k) ?? []), a]);
    });
    const out: { hora: string; ag: Agendamento | null }[] = [];
    slotsDoDia().forEach((h) => {
      const lista = ocupados.get(h);
      if (lista?.length) { lista.forEach((ag) => out.push({ hora: h, ag })); ocupados.delete(h); }
      else out.push({ hora: h, ag: null });
    });
    ocupados.forEach((lista, h) => lista.forEach((ag) => out.push({ hora: h, ag })));
    return out.sort((a, b) => a.hora.localeCompare(b.hora));
  }, [filtrados]);

  const diasComAgendamento = useMemo(
    () => mesItens.map((a) => startOfDay(new Date(a.data_hora))), [mesItens]);

  const abrirNovo = (hora?: string) => { setEditando(null); setHoraPadrao(hora); setDialogOpen(true); };
  const abrirEdicao = (ag: Agendamento) => { setEditando(ag); setHoraPadrao(undefined); setDialogOpen(true); };

  const mudarStatus = async (ag: Agendamento, status: string) => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", ag.id);
    if (error) { toast.error("Erro ao atualizar situação"); return; }
    toast.success("Situação atualizada");
    carregar();
  };

  const checkIn = async () => {
    const alvo = itens.filter((a) => ["agendado", "confirmado"].includes(a.status));
    if (!alvo.length) { toast.info("Nenhum paciente aguardando check-in"); return; }
    await supabase.from("agendamentos").update({ status: "presente" })
      .in("id", alvo.map((a) => a.id));
    toast.success(`${alvo.length} paciente(s) marcados como presentes`);
    carregar();
  };

  const bloquear = async (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    const dt = new Date(data); dt.setHours(h, m, 0, 0);
    const { error } = await supabase.from("agendamentos").insert({
      paciente_nome: "BLOQUEADO", data_hora: dt.toISOString(), tipo: "Bloqueio",
      procedimento: "Bloqueio de agenda", status: "cancelada_clinica",
      profissional: PROFISSIONAL, sala: SALA,
    });
    if (error) { toast.error("Erro ao bloquear horário"); return; }
    toast.success("Horário bloqueado");
    carregar();
  };

  const diasDoMes = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) }), [mes]);

  return (
    <div className="min-h-full bg-background">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b bg-card">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente, procedimento..." className="pl-9 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="leading-tight hidden sm:block">
              <p className="text-sm font-medium">Dra. Amélia Carvalho</p>
              <p className="text-[11px] text-muted-foreground">Agenda clínica</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 p-6">
        {/* Coluna principal */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setData(startOfDay(new Date()))}>
              <ArrowLeft className="h-4 w-4 mr-1" /> VOLTAR
            </Button>
            <h1 className="text-3xl font-display mr-auto">Agenda</h1>
            <Button variant="outline" size="sm"><Users className="h-4 w-4 mr-1" /> TODOS PROFISSIONAIS</Button>
            <Button size="sm" onClick={() => abrirNovo()}><Plus className="h-4 w-4 mr-1" /> AGENDAR</Button>
            <Button variant="outline" size="sm" onClick={checkIn}><UserCheck className="h-4 w-4 mr-1" /> CHECK-IN</Button>
            <Button variant="outline" size="sm"><Building2 className="h-4 w-4 mr-1" /> SALAS</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/40"
              onClick={() => bloquear(slotsDoDia().find((h) => !itens.some((a) => format(new Date(a.data_hora), "HH:mm") === h)) ?? "09:00")}>
              <Ban className="h-4 w-4 mr-1" /> BLOQUEIOS
            </Button>
            <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" /> RELATÓRIOS</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setData(addDays(data, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setData(addDays(data, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm font-semibold uppercase tracking-wide">
              {format(data, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            <Button variant="outline" size="sm" className="ml-auto"
              onClick={() => { const ult = [...mesItens].pop(); if (ult) setData(startOfDay(new Date(ult.data_hora))); }}>
              <CalendarDays className="h-4 w-4 mr-1" /> IR PARA ÚLTIMOS AGENDAMENTOS
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm">
            {(["agendado", "confirmado", "presente", "atendido"] as const).map((s) => (
              <span key={s} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", statusMeta[s].dot)} />
                {statusMeta[s].label.charAt(0) + statusMeta[s].label.slice(1).toLowerCase()}s ({contagem[s]})
              </span>
            ))}
          </div>

          {/* Tabela / calendário */}
          {modoCalendario ? (
            <div className="rounded-lg border bg-card p-4">
              <div className="grid grid-cols-7 gap-2">
                {DIAS.map((d) => (
                  <p key={d} className="text-xs font-medium text-muted-foreground text-center">{d}</p>
                ))}
                {Array.from({ length: startOfMonth(mes).getDay() }).map((_, i) => <div key={`e${i}`} />)}
                {diasDoMes.map((d) => {
                  const qtd = mesItens.filter((a) => isSameDay(new Date(a.data_hora), d)).length;
                  return (
                    <button key={d.toISOString()} onClick={() => { setData(d); setModoCalendario(false); }}
                      className={cn("rounded-md border p-2 text-left min-h-16 hover:bg-muted transition-colors",
                        isSameDay(d, data) && "border-primary bg-primary/10")}>
                      <span className="text-sm font-medium">{format(d, "d")}</span>
                      {qtd > 0 && <p className="text-[11px] text-primary mt-1">{qtd} agend.</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="w-10" />
                      <th className="text-left font-medium px-3 py-2 w-32">Horário</th>
                      <th className="text-left font-medium px-3 py-2">Paciente</th>
                      <th className="text-left font-medium px-3 py-2 w-24">Encaixe</th>
                      <th className="text-left font-medium px-3 py-2 w-28">Tipo</th>
                      <th className="text-left font-medium px-3 py-2 w-40">Procedimento</th>
                      <th className="text-left font-medium px-3 py-2 w-56">Situação</th>
                      <th className="text-left font-medium px-3 py-2 w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
                    )}
                    {!loading && linhas.map(({ hora, ag }, i) => {
                      const meta = ag ? statusMeta[ag.status] ?? statusMeta.agendado : null;
                      return (
                        <tr key={`${hora}-${i}`} className="border-t align-middle">
                          <td className="px-2 text-center">
                            {ag ? (
                              <button onClick={() => abrirEdicao(ag)} className="text-muted-foreground hover:text-foreground">
                                <Pencil className="h-4 w-4" />
                              </button>
                            ) : (
                              <button onClick={() => abrirNovo(hora)} className="text-muted-foreground hover:text-foreground">
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {ag ? (
                              <div className={cn("rounded-md border px-2 py-1.5 text-xs font-semibold leading-tight", meta!.className)}>
                                <div>{hora} ({ag.duracao_min}min)</div>
                                <div className="text-[10px] font-medium">{meta!.label}</div>
                              </div>
                            ) : (
                              <div className="rounded-md border border-success/50 bg-success/10 px-2 py-1.5 text-xs font-semibold text-success leading-tight">
                                <div>{hora}</div><div className="text-[10px]">LIVRE</div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {ag ? (
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="leading-tight">
                                  <p className="font-semibold uppercase text-[13px]">{ag.paciente_nome}</p>
                                  <button onClick={() => abrirEdicao(ag)} className="text-[11px] text-muted-foreground hover:underline">
                                    Detalhes
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => abrirNovo(hora)} className="text-muted-foreground hover:text-foreground">
                                Clique para agendar
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{ag?.tipo === "Encaixe" ? "Sim" : ""}</td>
                          <td className="px-3 py-2">
                            {ag && (
                              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium",
                                ag.tipo === "Teleconsulta" ? "bg-info/15 text-info" : "bg-primary/15 text-primary")}>
                                {ag.tipo}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{ag?.procedimento}</td>
                          <td className="px-3 py-2">
                            {ag && (
                              <span className={cn("inline-block rounded-md border px-2 py-1 text-[11px] font-semibold", meta!.className)}>
                                {meta!.label}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {ag && (
                              <DropdownMenu>
                                <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground">
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-popover z-50">
                                  {STATUS_OPTIONS.map((s) => (
                                    <DropdownMenuItem key={s.value} onClick={() => mudarStatus(ag, s.value)}>
                                      {s.label}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem onClick={() => abrirEdicao(ag)}>Editar / Excluir</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="space-y-4">
          <div className="rounded-lg border-2 border-accent/40 bg-card p-4">
            <p className="text-[11px] text-muted-foreground">Agenda selecionada</p>
            <p className="font-semibold">{PROFISSIONAL}</p>
            <p className="text-xs text-muted-foreground">(PSIQUIATRIA)</p>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
            <p><span className="text-muted-foreground">Sala:</span> <strong>{SALA}</strong></p>
            <p><span className="text-muted-foreground">Horário:</span> <strong>09:00:00 - 14:45:00</strong></p>
            <div>
              <p className="text-muted-foreground mb-1">Dias:</p>
              <div className="flex flex-wrap gap-1">
                {DIAS.map((d, i) => (
                  <span key={d} className={cn("rounded px-2 py-1 text-[11px] font-medium",
                    DIAS_ATIVOS.includes(i) ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => { setData(startOfDay(new Date())); setMes(startOfDay(new Date())); }}>HOJE</Button>
            <Button variant="outline" onClick={() => setModoCalendario((v) => !v)}>
              <CalendarDays className="h-4 w-4 mr-1" /> {modoCalendario ? "MODO LISTA" : "MODO CALENDÁRIO"}
            </Button>
          </div>

          <div className="rounded-lg border bg-card p-2">
            <Calendar mode="single" selected={data} month={mes} onMonthChange={setMes}
              onSelect={(d) => d && setData(startOfDay(d))} locale={ptBR}
              modifiers={{ comAgendamento: diasComAgendamento }}
              modifiersClassNames={{ comAgendamento: "bg-warning/30 font-semibold rounded-md" }}
              className={cn("p-3 pointer-events-auto")} />
          </div>

          <div className="rounded-lg border bg-card p-4 grid grid-cols-2 gap-2 text-xs">
            {[
              ["bg-success", "Livre"], ["bg-warning", "Parc. Livre"],
              ["bg-destructive", "Ocupada"], ["bg-destructive", "Bloqueado"],
              ["bg-muted-foreground", "Não Atende"], ["bg-info", "Com Paciente Agendado"],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", c)} />{l}
              </span>
            ))}
          </div>
        </aside>
      </div>

      <AgendamentoDialog open={dialogOpen} onOpenChange={setDialogOpen} agendamento={editando}
        defaultDate={data} defaultTime={horaPadrao} profissional={PROFISSIONAL} sala={SALA}
        onSaved={carregar} />
    </div>
  );
}
