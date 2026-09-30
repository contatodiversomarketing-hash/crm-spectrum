import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Phone, RefreshCw } from "lucide-react";

interface CallRow { agent_user_id: string | null; started_at: string; duration_seconds: number | null; status: string; metadata: Record<string, unknown> | null }

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diaSP = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min ${String(ss).padStart(2, "0")}s`;
};

export function RelatorioLigacoes() {
  const [ini, setIni] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); });
  const [fim, setFim] = useState(hojeSP());
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("calls").select("agent_user_id, started_at, duration_seconds, status, metadata")
        .gte("started_at", new Date(`${ini}T00:00:00-03:00`).toISOString())
        .lte("started_at", new Date(`${fim}T23:59:59.999-03:00`).toISOString())
        .order("started_at").limit(5000),
      supabase.from("profiles").select("user_id, nome, email"),
    ]);
    setCalls((c.data as CallRow[]) || []);
    const m: Record<string, string> = {};
    (p.data || []).forEach((x: { user_id: string; nome: string; email: string }) => { m[x.user_id] = x.nome || x.email; });
    setNomes(m);
    setLoading(false);
  }, [ini, fim]);
  useEffect(() => { carregar(); }, [carregar]);

  const quem = (c: CallRow) => c.agent_user_id ? (nomes[c.agent_user_id] || "Usuário") : "Ana (IA)";

  const { porPessoa, dias, porDia } = useMemo(() => {
    const pp: Record<string, { total: number; atendidas: number; dur: number }> = {};
    const pd: Record<string, Record<string, number>> = {};
    const ds = new Set<string>();
    calls.forEach((c) => {
      const k = quem(c), d = diaSP(c.started_at);
      ds.add(d);
      pp[k] ??= { total: 0, atendidas: 0, dur: 0 };
      pp[k].total++;
      if ((c.duration_seconds ?? 0) > 0) pp[k].atendidas++;
      pp[k].dur += c.duration_seconds ?? 0;
      pd[k] ??= {}; pd[k][d] = (pd[k][d] || 0) + 1;
    });
    return { porPessoa: Object.entries(pp).sort((a, b) => b[1].total - a[1].total), dias: [...ds].sort(), porDia: pd };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, nomes]);

  const totalDur = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Phone className="h-4 w-4 text-primary" />Ligações por pessoa</h2>
        <div className="flex items-end gap-2">
          <div><label className="text-xs text-muted-foreground">De</label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="h-8" /></div>
          <div><label className="text-xs text-muted-foreground">Até</label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-8" /></div>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={carregar}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-muted/50 p-3"><p className="text-xl font-semibold">{calls.length}</p><p className="text-xs text-muted-foreground">Ligações</p></div>
        <div className="rounded-md bg-muted/50 p-3"><p className="text-xl font-semibold">{fmt(totalDur)}</p><p className="text-xs text-muted-foreground">Tempo total</p></div>
        <div className="rounded-md bg-muted/50 p-3"><p className="text-xl font-semibold">{fmt(calls.length ? Math.round(totalDur / calls.length) : 0)}</p><p className="text-xs text-muted-foreground">Duração média</p></div>
      </div>

      {porPessoa.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ligação no período.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2">Quem ligou</th><th>Total</th><th>Atendidas</th><th>Tempo total</th><th>Média</th>
              {dias.map((d) => <th key={d} className="px-1">{d.slice(8, 10)}/{d.slice(5, 7)}</th>)}
            </tr></thead>
            <tbody>
              {porPessoa.map(([k, v]) => (
                <tr key={k} className="border-b text-center">
                  <td className="text-left py-2 font-medium">{k}</td><td>{v.total}</td><td>{v.atendidas}</td>
                  <td>{fmt(v.dur)}</td><td>{fmt(v.total ? Math.round(v.dur / v.total) : 0)}</td>
                  {dias.map((d) => <td key={d} className="px-1">{porDia[k][d] || "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
