import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTwilio } from "@/contexts/TwilioContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Phone, ChevronDown, ChevronUp, Stethoscope } from "lucide-react";

interface Chamada {
  id: string; phone_number: string; client_name: string | null; status: string; duration_seconds: number | null;
  recording_url: string | null; transcription: string | null; created_at: string; agent_user_id: string | null;
}
interface Nota { call_id: string; nota_geral: number | null; rapport: number | null; objecoes: number | null; fechamento: number | null; cordialidade: number | null; feedback: string | null }

const STATUS: Record<string, string> = { ringing: "Chamando", in_progress: "Em chamada", completed: "Concluída", failed: "Falhou", busy: "Ocupado", no_answer: "Não atendeu" };

export default function Chamadas() {
  const { ligar, estado } = useTwilio();
  const { hasAnyRole } = useAuth();
  const [lista, setLista] = useState<Chamada[]>([]);
  const [notas, setNotas] = useState<Record<string, Nota>>({});
  const [perfis, setPerfis] = useState<Record<string, string>>({});
  const [numero, setNumero] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroAtendente, setFiltroAtendente] = useState("todos");
  const [periodo, setPeriodo] = useState("30");
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = async () => {
    const desde = new Date(Date.now() - Number(periodo) * 86400000).toISOString();
    const { data } = await supabase.from("calls").select("*").gte("created_at", desde).order("created_at", { ascending: false }).limit(300);
    setLista((data as Chamada[]) ?? []);
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: n } = await supabase.from("consultant_scores").select("*").in("call_id", ids);
      setNotas(Object.fromEntries((n ?? []).map((x) => [x.call_id, x as Nota])));
    }
  };

  useEffect(() => { carregar(); }, [periodo]);
  useEffect(() => {
    supabase.from("profiles").select("user_id, nome").then(({ data }) => setPerfis(Object.fromEntries((data ?? []).map((p) => [p.user_id, p.nome]))));
    const ch = supabase.channel("calls-rt").on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => carregar()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtradas = useMemo(() => lista.filter((c) =>
    (filtroStatus === "todos" || c.status === filtroStatus) && (filtroAtendente === "todos" || c.agent_user_id === filtroAtendente)), [lista, filtroStatus, filtroAtendente]);

  const testar = async () => {
    const { data, error } = await supabase.functions.invoke("call-control", { body: { action: "test" } });
    if (error) return toast.error(error.message);
    data.status === "Twilio OK" ? toast.success("Twilio OK") : toast.error(`Problemas: ${data.issues.join("; ")}`);
  };

  const dur = (s: number | null) => (s ? `${Math.floor(s / 60)}m ${s % 60}s` : "—");

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Chamadas</h1>
        {hasAnyRole("admin") && <Button variant="outline" onClick={testar}><Stethoscope className="mr-2 h-4 w-4" />Testar conexão</Button>}
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          <Input placeholder="DDD + número, ex.: 32 99999-9999" value={numero} onChange={(e) => setNumero(e.target.value)} className="max-w-xs" />
          <Button disabled={estado !== "idle" || !numero} onClick={() => ligar({ telefone: numero })}><Phone className="mr-2 h-4 w-4" />Ligar</Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="1">Hoje</SelectItem><SelectItem value="7">7 dias</SelectItem><SelectItem value="30">30 dias</SelectItem><SelectItem value="90">90 dias</SelectItem></SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos status</SelectItem>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filtroAtendente} onValueChange={setFiltroAtendente}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos atendentes</SelectItem>{Object.entries(perfis).map(([k, v]) => <SelectItem key={k} value={k}>{v || "Sem nome"}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Histórico ({filtradas.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {filtradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ligação no período.</p>}
          {filtradas.map((c) => {
            const n = notas[c.id];
            const open = aberto === c.id;
            return (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium">{c.client_name || c.phone_number}</p>
                    <p className="text-xs text-muted-foreground">{c.phone_number} · {new Date(c.created_at).toLocaleString("pt-BR")} · {perfis[c.agent_user_id ?? ""] ?? "—"}</p>
                  </div>
                  <Badge variant="secondary">{STATUS[c.status] ?? c.status}</Badge>
                  <span className="text-sm">{dur(c.duration_seconds)}</span>
                  {n?.nota_geral != null && <Badge>Nota {n.nota_geral}</Badge>}
                  <Button variant="ghost" size="icon" disabled={estado !== "idle"} onClick={() => ligar({ telefone: c.phone_number, nome: c.client_name })} title="Ligar de novo"><Phone className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setAberto(open ? null : c.id)}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
                </div>
                {open && (
                  <div className="mt-3 space-y-3 text-sm">
                    {c.recording_url ? <GravacaoPlayer id={c.id} /> : <p className="text-muted-foreground">Sem gravação.</p>}
                    {n && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[["Rapport", n.rapport], ["Objeções", n.objecoes], ["Fechamento", n.fechamento], ["Cordialidade", n.cordialidade]].map(([k, v]) => (
                          <div key={k as string} className="rounded bg-muted p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium">{v ?? "—"}</p></div>
                        ))}
                      </div>
                    )}
                    {n?.feedback && <p><strong>Feedback:</strong> {n.feedback}</p>}
                    <div><strong>Transcrição:</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.transcription || (c.recording_url ? "Processando…" : "—")}</p></div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function GravacaoPlayer({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let revoke: string | null = null;
    supabase.functions.invoke("call-control", { body: { action: "recording", callId: id } }).then(async ({ data, error }) => {
      if (error || !(data instanceof Blob)) { setErro(true); return; }
      revoke = URL.createObjectURL(data); setUrl(revoke);
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [id]);
  if (erro) return <p className="text-muted-foreground">Não foi possível carregar a gravação.</p>;
  return url ? <audio controls src={url} className="w-full" /> : <p className="text-muted-foreground">Carregando gravação…</p>;
}
