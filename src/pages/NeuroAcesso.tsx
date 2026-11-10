import { baixarRelatorioPdf } from "@/lib/relatorioPdf";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, ExternalLink, FileText, Trash2, ArrowLeft, MessageCircle, Download } from "lucide-react";
import { QUESTIONARIO_MENTORADA } from "@/lib/neuroacessoQuestionario";
import { QuestionarioView } from "@/components/neuroacesso/QuestionarioView";
import { AnaliseIA, questionarioMarkdown } from "@/components/neuroacesso/AnaliseIA";
import { RelatoriosSalvos } from "@/components/neuroacesso/RelatoriosSalvos";
import { AgendaNeuroAcesso } from "@/components/neuroacesso/AgendaNeuroAcesso";

interface Resp { id: string; nome: string; email: string | null; telefone: string | null; respostas: Record<string, unknown>; anexos: { nome: string; path: string }[]; lido: boolean; criado_em: string }

const LINK_PUBLICO = "https://crm-spectrum.lovable.app/q/neuroacesso";

export default function NeuroAcesso() {
  const [lista, setLista] = useState<Resp[]>([]);
  const [sel, setSel] = useState<Resp | null>(null);
  const link = LINK_PUBLICO;

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("neuroacesso_respostas").select("*").order("criado_em", { ascending: false });
    setLista((data as unknown as Resp[]) || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = async (r: Resp) => {
    setSel(r);
    if (!r.lido) { await supabase.from("neuroacesso_respostas").update({ lido: true }).eq("id", r.id); setLista((l) => l.map((x) => x.id === r.id ? { ...x, lido: true } : x)); }
  };
  const abrirAnexo = async (path: string) => {
    const { data } = await supabase.storage.from("neuroacesso").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const excluir = async (r: Resp) => {
    if (!confirm(`Excluir as respostas de ${r.nome}?`)) return;
    await supabase.from("neuroacesso_respostas").delete().eq("id", r.id);
    setSel(null); carregar();
  };
  const dt = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-xs tracking-[0.3em] uppercase text-accent">Método</p>
        <h1 className="font-display text-4xl">NeuroAcesso</h1>
      </div>

      <Tabs defaultValue="respostas">
        <TabsList className="h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="respostas">Respostas {lista.filter((r) => !r.lido).length > 0 && `(${lista.filter((r) => !r.lido).length} novas)`}</TabsTrigger>
          <TabsTrigger value="questionario">Questionário</TabsTrigger>
          <TabsTrigger value="analise">IA de Análise</TabsTrigger>
          <TabsTrigger value="agenda">Agenda NeuroAcesso</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda"><AgendaNeuroAcesso /></TabsContent>

        <TabsContent value="analise" className="pt-4">
          <AnaliseIA respostas={lista} />
        </TabsContent>

        <TabsContent value="questionario" className="space-y-4 pt-4">
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <p className="font-medium">Link para enviar à cliente</p>
            <div className="flex flex-wrap gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-3 py-2 text-sm">{link}</code>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}><Copy className="h-4 w-4 mr-1" />Copiar</Button>
              <Button variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Olá! Segue o questionário do Método NeuroAcesso para preencher antes do nosso primeiro encontro: ${link}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a></Button>
              <Button variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Ver</a></Button>
            </div>
            <p className="text-xs text-muted-foreground">O mesmo link serve para todas. Cada resposta aparece separada na aba Respostas.</p>
          </div>
          <QuestionarioView secoes={QUESTIONARIO_MENTORADA} valores={{}} />
        </TabsContent>

        <TabsContent value="respostas" className="pt-4">
          {sel ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setSel(null)}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
                <div className="flex gap-2"><Button variant="outline" onClick={() => baixarRelatorioPdf(questionarioMarkdown(sel), { titulo: `Questionário NeuroAcesso — ${sel.nome}`, data: `Enviado em ${dt(sel.criado_em)}`, pessoa: sel.nome, tipo: "Questionário da mentorada" })}><Download className="h-4 w-4 mr-1" />Baixar PDF</Button><Button variant="outline" className="text-destructive" onClick={() => excluir(sel)}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button></div>
              </div>
              <Tabs defaultValue="q">
                <TabsList><TabsTrigger value="q">Questionário</TabsTrigger><TabsTrigger value="r">Relatórios da IA</TabsTrigger></TabsList>
                <TabsContent value="r" className="pt-4"><RelatoriosSalvos respostaId={sel.id} nome={sel.nome} /></TabsContent>
                <TabsContent value="q" className="pt-4">
              <div id="neuroacesso-print" className="space-y-4"><div className="rounded-2xl border bg-card p-5">
                <h2 className="font-display text-3xl">{sel.nome}</h2>
                <p className="text-sm text-muted-foreground">{[sel.email, sel.telefone].filter(Boolean).join(" · ")} · enviado em {dt(sel.criado_em)}</p>
                {sel.anexos?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sel.anexos.map((a) => <Button key={a.path} size="sm" variant="outline" onClick={() => abrirAnexo(a.path)}><FileText className="h-4 w-4 mr-1" />{a.nome}</Button>)}
                  </div>
                )}
              </div>
              <QuestionarioView secoes={QUESTIONARIO_MENTORADA} valores={sel.respostas || {}} /></div>
                </TabsContent>
              </Tabs>
            </div>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma resposta ainda. Envie o link da aba Questionário.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {lista.map((r) => (
                <button key={r.id} onClick={() => abrir(r)} className="text-left rounded-xl border bg-card p-4 hover:border-primary transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{r.nome}</p>
                    {!r.lido && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">nova</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{dt(r.criado_em)}{r.anexos?.length ? ` · ${r.anexos.length} anexo(s)` : ""}</p>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
