import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Brain, GraduationCap, Loader2, Send, FileSearch } from "lucide-react";
import { QUESTIONARIO_MENTORADA } from "@/lib/neuroacessoQuestionario";

interface Msg { id: string; role: "user" | "assistant"; conteudo: string; ensinamento: boolean; autor_nome: string | null; criado_em: string }
interface RespLite { id: string; nome: string; email: string | null; telefone: string | null; respostas: Record<string, unknown>; criado_em: string }

function valorTexto(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(valorTexto).join(", ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${valorTexto(x)}`).join("; ");
  return String(v);
}

export function formatarQuestionario(r: RespLite): string {
  const linhas = [`Nome: ${r.nome}`, `Email: ${r.email || "—"}`, `WhatsApp: ${r.telefone || "—"}`];
  for (const s of QUESTIONARIO_MENTORADA) {
    linhas.push(`\n## ${s.titulo}`);
    for (const p of s.perguntas) {
      if (p.tipo === "aviso") continue;
      linhas.push(`- ${p.label || p.id}: ${valorTexto(r.respostas?.[p.id])}`);
    }
  }
  return linhas.join("\n");
}

export function AnaliseIA({ respostas }: { respostas: RespLite[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [ensinar, setEnsinar] = useState(false);
  const [respSel, setRespSel] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("neuroacesso_ia_mensagens").select("*").order("criado_em");
    setMsgs((data as Msg[]) || []);
  }, []);
  useEffect(() => { carregar(); inputRef.current?.focus(); }, [carregar]);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, enviando]);

  const enviar = async (mensagem: string, extra?: { resposta_id: string; questionario_texto: string }) => {
    if (!mensagem.trim() || enviando) return;
    setEnviando(true);
    const otimista: Msg = { id: "tmp", role: "user", conteudo: mensagem, ensinamento: ensinar, autor_nome: "Você", criado_em: new Date().toISOString() };
    setMsgs((m) => [...m, otimista]);
    setTexto("");
    const { data, error } = await supabase.functions.invoke("neuroacesso-analise-ia", {
      body: { mensagem, ensinamento: ensinar && !extra, ...extra },
    });
    if (error || data?.error) { toast.error(data?.error || "Não foi possível falar com a IA agora."); setTexto(mensagem); }
    await carregar();
    setEnviando(false);
    inputRef.current?.focus();
  };

  const analisar = () => {
    const r = respostas.find((x) => x.id === respSel);
    if (!r) return;
    enviar(`Analise o questionário de ${r.nome} e faça o relatório de sugestões para ela.`, { resposta_id: r.id, questionario_texto: formatarQuestionario(r) });
  };

  const hora = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="rounded-2xl border bg-card flex flex-col h-[70vh]">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <FileSearch className="h-4 w-4 text-primary" />
        <select value={respSel} onChange={(e) => setRespSel(e.target.value)} className="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">Escolha um questionário para analisar…</option>
          {respostas.map((r) => <option key={r.id} value={r.id}>{r.nome} — {hora(r.criado_em)}</option>)}
        </select>
        <Button onClick={analisar} disabled={!respSel || enviando}>Gerar relatório</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {msgs.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-10 space-y-2">
            <Brain className="h-8 w-8 mx-auto text-primary" />
            <p>Ensine aqui o Método NeuroAcesso e como a análise deve ser feita.</p>
            <p>Depois escolha um questionário acima e clique em <b>Gerar relatório</b>.</p>
          </div>
        )}
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm">
              {m.ensinamento && <p className="text-[11px] uppercase tracking-wider opacity-80 flex items-center gap-1 mb-1"><GraduationCap className="h-3 w-3" />Ensinamento</p>}
              <p className="whitespace-pre-wrap">{m.conteudo.split("\n\n---\nRESPOSTAS DO QUESTIONÁRIO:")[0]}</p>
              <p className="text-[10px] opacity-70 mt-1 text-right">{m.autor_nome} · {hora(m.criado_em)}</p>
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex gap-3">
            <div className="h-8 w-8 shrink-0 rounded-full bg-accent/20 text-accent flex items-center justify-center"><Brain className="h-4 w-4" /></div>
            <div className="prose prose-sm max-w-none text-foreground">
              <ReactMarkdown>{m.conteudo}</ReactMarkdown>
              <p className="text-[10px] text-muted-foreground">{hora(m.criado_em)}</p>
            </div>
          </div>
        ))}
        {enviando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Analisando…</div>}
        <div ref={fimRef} />
      </div>

      <div className="border-t p-3 space-y-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={ensinar} onCheckedChange={setEnsinar} />
          <GraduationCap className="h-3.5 w-3.5" />Guardar esta mensagem como ensinamento permanente
        </label>
        <div className="flex gap-2 items-end">
          <Textarea ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
            placeholder={ensinar ? "Ensine algo sobre o método ou a forma de analisar…" : "Converse com a IA de análise…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} className="resize-none" />
          <Button size="icon" onClick={() => enviar(texto)} disabled={!texto.trim() || enviando}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
