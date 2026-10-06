import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Paperclip, X, Loader2, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo-amelia.png";
import { QUESTIONARIO_MENTORADA } from "@/lib/neuroacessoQuestionario";
import { QuestionarioView, type Respostas } from "@/components/neuroacesso/QuestionarioView";

export default function QuestionarioPublico() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [resp, setResp] = useState<Respostas>({});
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const enviar = async () => {
    if (nome.trim().length < 2) { toast.error("Informe seu nome"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
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
    setOk(true); window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col items-center text-center gap-3">
          <img src={logo} alt="Dra. Amélia Carvalho" className="h-16 w-16 object-contain" />
          <p className="text-xs tracking-[0.3em] uppercase text-sidebar-primary">Método NeuroAcesso</p>
          <h1 className="font-display text-4xl text-sidebar-accent-foreground">Questionário da mentorada</h1>
          <p className="text-sm opacity-80">Diagnóstico inicial · Consultório com terapeutas parceiros</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {ok ? (
          <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <h2 className="font-display text-3xl">Respostas enviadas!</h2>
            <p className="text-muted-foreground">Obrigada, {nome.split(" ")[0]}. A equipe da Dra. Amélia vai analisar antes do primeiro encontro.</p>
          </div>
        ) : (<>
          <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5 text-sm">
            Preencha antes do primeiro encontro. Use estimativas quando não houver números disponíveis. Nos exemplos, identifique pacientes apenas por códigos; não inclua nomes, CPF, endereço ou prontuário completo.
          </div>

          <section className="rounded-2xl border bg-card p-6 shadow-sm grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Seu nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
          </section>

          <QuestionarioView secoes={QUESTIONARIO_MENTORADA} valores={resp} onChange={(id, v) => setResp((r) => ({ ...r, [id]: v }))} />

          <section className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
            <h2 className="font-display text-2xl text-primary">Anexos</h2>
            <p className="text-sm text-muted-foreground">Documentos, planilhas ou fotos que ajudem na análise (até 20 MB cada).</p>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); setArquivos((a) => [...a, ...fs]); e.target.value = ""; }} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4 mr-2" />Anexar arquivos</Button>
            {arquivos.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="truncate">{f.name}</span>
                <Button variant="ghost" size="icon" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </section>

          <Button size="lg" className="w-full" onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Enviar respostas
          </Button>
        </>)}
        <p className="text-center text-xs text-muted-foreground pb-6">Dra. Amélia Carvalho · Cuidado que entende. Tratamento que transforma.</p>
      </main>
    </div>
  );
}
