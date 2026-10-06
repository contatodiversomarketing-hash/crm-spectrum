import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Paperclip, X, Loader2, CheckCircle2, ArrowLeft, ArrowRight, Sparkles, UploadCloud, Check, Clock, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo-amelia.png";
import { QUESTIONARIO_MENTORADA } from "@/lib/neuroacessoQuestionario";
import { QuestionarioView, type Respostas } from "@/components/neuroacesso/QuestionarioView";

const STORAGE = "neuroacesso-rascunho";
const splitTitulo = (t: string) => { const m = t.match(/^(\d+)\s*·\s*(.*)$/); return m ? { n: m[1], t: m[2] } : { n: "", t }; };

function preenchido(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.values(v as object).some(preenchido);
  return true;
}

export default function QuestionarioPublico() {
  const rascunho = useMemo(() => { try { return JSON.parse(localStorage.getItem(STORAGE) || "{}"); } catch { return {}; } }, []);
  const [nome, setNome] = useState<string>(rascunho.nome ?? "");
  const [email, setEmail] = useState<string>(rascunho.email ?? "");
  const [telefone, setTelefone] = useState<string>(rascunho.telefone ?? "");
  const [resp, setResp] = useState<Respostas>(rascunho.resp ?? {});
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [passo, setPasso] = useState<number>(-1); // -1 boas-vindas, 0 identificação, 1..N seções, N+1 anexos
  const [arrastando, setArrastando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const secoes = QUESTIONARIO_MENTORADA;
  const total = secoes.length + 2;
  const ultimo = secoes.length + 1;

  useEffect(() => { localStorage.setItem(STORAGE, JSON.stringify({ nome, email, telefone, resp })); }, [nome, email, telefone, resp]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [passo]);

  const progressoSecao = (i: number) => {
    const qs = secoes[i].perguntas.filter((p) => p.tipo !== "aviso");
    if (!qs.length) return 1;
    return qs.filter((p) => preenchido(resp[p.id])).length / qs.length;
  };
  const respondidas = secoes.flatMap((s) => s.perguntas).filter((p) => p.tipo !== "aviso" && preenchido(resp[p.id])).length;
  const totalPerguntas = secoes.flatMap((s) => s.perguntas).filter((p) => p.tipo !== "aviso").length;
  const pct = passo < 0 ? 0 : Math.round(((passo + 1) / total) * 100);

  const avancar = () => {
    if (passo === 0 && nome.trim().length < 2) { toast.error("Conte pra gente seu nome 💛"); return; }
    setPasso((p) => Math.min(p + 1, ultimo));
  };

  const addFiles = (fs: File[]) => setArquivos((a) => [...a, ...fs]);

  const enviar = async () => {
    if (nome.trim().length < 2) { toast.error("Informe seu nome"); setPasso(0); return; }
    setEnviando(true);
    const anexos: { nome: string; path: string }[] = [];
    for (const f of arquivos) {
      const path = `respostas/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("neuroacesso").upload(path, f);
      if (error) { toast.error(`Não foi possível enviar ${f.name}`); continue; }
      anexos.push({ nome: f.name, path });
    }
    const { error } = await supabase.from("neuroacesso_respostas").insert({
      nome: nome.trim(), email: email.trim() || null, telefone: telefone.trim() || null, respostas: resp as never, anexos: anexos as never,
    });
    setEnviando(false);
    if (error) { toast.error("Não foi possível enviar. Tente novamente."); return; }
    localStorage.removeItem(STORAGE);
    setOk(true); window.scrollTo({ top: 0 });
  };

  const Fundo = () => (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl animate-pulse" />
      <div className="absolute top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-accent/15 blur-3xl animate-pulse [animation-delay:1.5s]" />
      <div className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full bg-secondary/60 blur-3xl" />
    </div>
  );

  if (ok) return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-6">
      <Fundo />
      <div className="max-w-lg w-full rounded-3xl border bg-card/90 backdrop-blur p-10 text-center space-y-5 shadow-xl animate-in fade-in zoom-in-95 duration-500">
        <div className="mx-auto h-20 w-20 rounded-full bg-primary/15 flex items-center justify-center animate-in zoom-in duration-700">
          <CheckCircle2 className="h-11 w-11 text-primary" />
        </div>
        <h2 className="font-display text-4xl">Respostas enviadas!</h2>
        <p className="text-muted-foreground">Obrigada, {nome.split(" ")[0]}. A equipe da Dra. Amélia vai analisar tudo com carinho antes do primeiro encontro.</p>
        <img src={logo} alt="" className="h-10 mx-auto opacity-70" />
      </div>
    </div>
  );

  if (passo === -1) return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-6">
      <Fundo />
      <div className="max-w-2xl w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <img src={logo} alt="Dra. Amélia Carvalho" className="h-20 w-20 object-contain mx-auto" />
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1 text-xs tracking-[0.3em] uppercase text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Método NeuroAcesso
          </p>
          <h1 className="font-display text-5xl md:text-6xl leading-tight">Questionário da <em className="text-primary">mentorada</em></h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">Um diagnóstico inicial do seu consultório e da sua rede de terapeutas parceiros.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          {[{ i: Clock, t: "Cerca de 20 minutos" }, { i: Check, t: "Salva automaticamente" }, { i: ShieldCheck, t: "Sem dados de pacientes" }].map(({ i: I, t }) => (
            <div key={t} className="rounded-2xl border bg-card/80 backdrop-blur p-4 flex items-center gap-2 justify-center"><I className="h-4 w-4 text-primary" />{t}</div>
          ))}
        </div>
        <Button size="lg" className="h-14 px-10 rounded-full text-base shadow-lg hover:scale-105 transition-transform" onClick={() => setPasso(0)}>
          {respondidas > 0 || nome ? "Continuar de onde parei" : "Começar"} <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
        <p className="text-xs text-muted-foreground">Use estimativas quando não houver números. Identifique pacientes apenas por códigos.</p>
      </div>
    </div>
  );

  const secaoAtual = passo >= 1 && passo <= secoes.length ? secoes[passo - 1] : null;
  const tit = secaoAtual ? splitTitulo(secaoAtual.titulo) : null;

  return (
    <div className="relative min-h-screen bg-background">
      <Fundo />
      {/* Topo fixo com progresso */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <img src={logo} alt="" className="h-9 w-9 object-contain" />
          <div className="flex-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-foreground">NeuroAcesso</span>
              <span>{respondidas}/{totalPerguntas} respondidas · {pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-[230px_1fr] gap-8">
        {/* Navegação de etapas */}
        <nav className="hidden lg:block">
          <ol className="sticky top-24 space-y-1">
            {[{ t: "Seus dados", n: "•" }, ...secoes.map((s) => splitTitulo(s.titulo)), { t: "Anexos e envio", n: "✓" }].map((s, i) => {
              const ativo = passo === i;
              const prog = i >= 1 && i <= secoes.length ? progressoSecao(i - 1) : i === 0 ? (nome ? 1 : 0) : 0;
              return (
                <li key={i}>
                  <button onClick={() => (i === 0 || nome.trim().length >= 2) ? setPasso(i) : toast.error("Comece pelo seu nome")}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-all ${ativo ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted"}`}>
                    <span className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors ${ativo ? "border-primary-foreground/50" : prog >= 1 ? "bg-primary/15 border-primary/40 text-primary" : "border-border"}`}>
                      {prog >= 1 && !ativo ? <Check className="h-3.5 w-3.5" /> : (s.n || i)}
                    </span>
                    <span className="line-clamp-2 leading-tight">{s.t}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main key={passo} className="space-y-6 animate-in fade-in slide-in-from-right-6 duration-500 min-w-0">
          {passo === 0 && (
            <section className="rounded-3xl border bg-card/90 backdrop-blur p-8 shadow-sm space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-accent">Etapa inicial</p>
                <h2 className="font-display text-4xl mt-1">Vamos nos conhecer</h2>
                <p className="text-muted-foreground mt-1">Assim sabemos de quem são estas respostas.</p>
              </div>
              <div className="grid gap-4">
                <div className="space-y-1.5"><Label>Seu nome *</Label><Input autoFocus className="h-12 text-base" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como você se chama?" /></div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>E-mail</Label><Input className="h-12" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
                  <div className="space-y-1.5"><Label>WhatsApp</Label><Input className="h-12" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" /></div>
                </div>
              </div>
            </section>
          )}

          {secaoAtual && tit && (
            <section className="rounded-3xl border bg-card/90 backdrop-blur p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex items-start gap-4">
                <span className="font-display text-6xl leading-none text-primary/25 select-none">{tit.n.padStart(2, "0")}</span>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-accent">Etapa {passo} de {secoes.length}</p>
                  <h2 className="font-display text-3xl sm:text-4xl mt-1">{tit.t}</h2>
                  {secaoAtual.subtitulo && <p className="text-muted-foreground mt-1">{secaoAtual.subtitulo}</p>}
                </div>
              </div>
              <QuestionarioView secoes={[{ ...secaoAtual, titulo: "" }]} valores={resp} semMolde
                onChange={(id, v) => setResp((r) => ({ ...r, [id]: v }))} />
            </section>
          )}

          {passo === ultimo && (
            <section className="rounded-3xl border bg-card/90 backdrop-blur p-8 shadow-sm space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-accent">Última etapa</p>
                <h2 className="font-display text-4xl mt-1">Anexos e envio</h2>
                <p className="text-muted-foreground mt-1">Documentos, planilhas ou fotos que ajudem na análise (até 20 MB cada). Opcional.</p>
              </div>
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); addFiles(fs); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastando(false); addFiles(Array.from(e.dataTransfer.files)); }}
                className={`w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-2 transition-all ${arrastando ? "border-primary bg-primary/10 scale-[1.01]" : "border-border hover:border-primary/60 hover:bg-muted/40"}`}>
                <UploadCloud className="h-10 w-10 text-primary" />
                <span className="font-medium">Arraste arquivos aqui ou clique para escolher</span>
                <span className="text-xs text-muted-foreground">PDF, imagens, planilhas, documentos</span>
              </button>
              <div className="space-y-2">
                {arquivos.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border bg-background px-4 py-2.5 text-sm animate-in fade-in slide-in-from-left-2">
                    <Paperclip className="h-4 w-4 text-accent shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-secondary/50 p-5 grid sm:grid-cols-2 gap-2 text-sm">
                {secoes.map((s, i) => {
                  const p = progressoSecao(i); const st = splitTitulo(s.titulo);
                  return (
                    <button key={i} onClick={() => setPasso(i + 1)} className="flex items-center gap-2 text-left hover:text-primary">
                      <span className={`h-2 w-2 rounded-full ${p >= 1 ? "bg-primary" : p > 0 ? "bg-accent" : "bg-muted-foreground/30"}`} />
                      <span className="truncate">{st.t}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{Math.round(p * 100)}%</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="lg" className="rounded-full" onClick={() => setPasso((p) => p - 1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />Voltar
            </Button>
            {passo < ultimo ? (
              <Button size="lg" className="rounded-full px-8 shadow-md hover:scale-105 transition-transform" onClick={avancar}>
                Continuar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button size="lg" className="rounded-full px-8 shadow-lg hover:scale-105 transition-transform" onClick={enviar} disabled={enviando}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}Enviar respostas
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground pt-4">Dra. Amélia Carvalho · Cuidado que entende. Tratamento que transforma.</p>
        </main>
      </div>
    </div>
  );
}
