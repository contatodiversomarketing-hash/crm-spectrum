import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, MessageSquare, MessagesSquare, Send, Power } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Interacao {
  id: string;
  paciente_externo_id: string;
  mensagem_usuario: string | null;
  resposta_final: string | null;
  supervisionado: boolean;
  intencao_detectada: string | null;
  atendente_humano: string | null;
  criado_em: string;
  canal: string;
}

interface Conversa {
  telefone: string;
  nome: string;
  itens: Interacao[];
  ultima: string;
}

function soDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

// Chave única por contato: 55 + DDD + número (ignora DDI/zeros/variações)
function chaveTelefone(v: string) {
  let d = soDigitos(v);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d ? `55${d}` : "";
}


function formatarTelefone(v: string) {
  const d = soDigitos(v);
  const semDDI = d.startsWith("55") ? d.slice(2) : d;
  if (semDDI.length >= 10) {
    return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, semDDI.length - 4)}-${semDDI.slice(-4)}`;
  }
  return v;
}

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Conversas() {
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [iaAtiva, setIaAtiva] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const sincronizados = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [intRes, leadsRes] = await Promise.all([
        supabase
          .from("interacoes_ia")
          .select("id, paciente_externo_id, mensagem_usuario, resposta_final, supervisionado, intencao_detectada, atendente_humano, criado_em, canal")
          .order("criado_em", { ascending: false })
          .limit(2000),
        supabase.from("leads").select("nome, telefone").limit(2000),
      ]);

      const lista = (intRes.data as Interacao[]) || [];
      setInteracoes(lista);
      const mapa: Record<string, string> = {};
      const existentes = new Set<string>();
      for (const l of leadsRes.data || []) {
        if (l.telefone) {
          const d = soDigitos(l.telefone);
          existentes.add(d);
          existentes.add(d.startsWith("55") ? d.slice(2) : "55" + d);
          if (l.nome) mapa[d] = l.nome;
        }
      }
      setNomes(mapa);

      // Toda conversa também vira card no CRM
      const faltantes = Array.from(
        new Set(
          lista
            .map((i) => soDigitos(i.paciente_externo_id.replace("tel:", "")))
            .filter((d) => d.length >= 10 && !existentes.has(d) && !sincronizados.current.has(d))
        )
      );
      if (faltantes.length) {
        faltantes.forEach((d) => sincronizados.current.add(d));
        const { data: pipes } = await supabase.from("pipelines").select("id, nome");
        const pipelineId = pipes?.find((p) => p.nome === "Pacientes")?.id || pipes?.[0]?.id || null;
        await supabase.from("leads").insert(
          faltantes.map((d) => ({
            telefone: d,
            nome: formatarTelefone(d),
            origem: "whatsapp",
            status: "novo",
            status_pipeline: "novo",
            pipeline_id: pipelineId,
          }))
        );
      }
    } catch (e) {
      console.error("[conversas] erro", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarConfig = useCallback(async () => {
    const { data } = await supabase
      .from("configuracoes_sistema")
      .select("id, whatsapp_ativo")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setConfigId(data.id);
      setIaAtiva(data.whatsapp_ativo);
    }
  }, []);

  async function alternarIa(valor: boolean) {
    setIaAtiva(valor);
    if (!configId) return;
    const { error } = await supabase
      .from("configuracoes_sistema")
      .update({ whatsapp_ativo: valor })
      .eq("id", configId);
    if (error) {
      setIaAtiva(!valor);
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }
    toast({
      title: valor ? "Atendimento da Ana ativado" : "Atendimento da Ana pausado",
      description: valor ? "Ela volta a responder automaticamente." : "Nenhuma resposta automática será enviada.",
    });
  }

  async function enviar(numero: string) {
    const msg = texto.trim();
    if (!msg || enviando) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
        body: { numero: soDigitos(numero), tipo: "text", texto: msg },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message);
      }
      setTexto("");
      carregar();
    } catch (e) {
      toast({ title: "Falha ao enviar", description: String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    carregar();
    carregarConfig();
    const channel = supabase
      .channel("conversas-unificadas")
      .on("postgres_changes", { event: "*", schema: "public", table: "interacoes_ia" }, () => carregar())
      .subscribe();
    const intervalo = setInterval(() => carregar(), 5000);
    const onFocus = () => carregar();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(intervalo);
      window.removeEventListener("focus", onFocus);
    };
  }, [carregar, carregarConfig]);


  const conversas = useMemo<Conversa[]>(() => {
    const grupos: Record<string, Interacao[]> = {};
    for (const i of interacoes) {
      const tel = i.paciente_externo_id.replace("tel:", "");
      if (!grupos[tel]) grupos[tel] = [];
      grupos[tel].push(i);
    }

    return Object.entries(grupos)
      .map(([telefone, itens]) => {
        const ordenados = [...itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
        const digits = soDigitos(telefone);
        const nome =
          nomes[digits] ||
          nomes[digits.startsWith("55") ? digits.slice(2) : "55" + digits] ||
          formatarTelefone(telefone);
        return { telefone, nome, itens: ordenados, ultima: ordenados[ordenados.length - 1].criado_em };
      })
      .filter((c) =>
        !busca.trim() ||
        c.nome.toLowerCase().includes(busca.toLowerCase()) ||
        soDigitos(c.telefone).includes(soDigitos(busca))
      )
      .sort((a, b) => b.ultima.localeCompare(a.ultima));
  }, [interacoes, nomes, busca]);

  const ativa = conversas.find((c) => c.telefone === selecionada) || conversas[0];

  const titulo = "Conversas";
  const subtitulo = "Espelho do WhatsApp — pacientes, Ana e atendentes no mesmo chat";


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <MessagesSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{titulo}</h1>
              <p className="text-xs text-muted-foreground">{subtitulo}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <Power className={`h-4 w-4 ${iaAtiva ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-xs font-medium">{iaAtiva ? "Atendimento ativo" : "Atendimento pausado"}</span>
              <Switch checked={iaAtiva} onCheckedChange={alternarIa} />
            </div>
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-[calc(100vh-73px)]">
        {/* Lista de conversas */}
        <aside className="border-r bg-card/40 flex flex-col min-h-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato..." className="pl-8 h-9 text-sm" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loading && conversas.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Carregando...</p>
            ) : conversas.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhuma conversa encontrada.</p>
            ) : (
              conversas.map((c) => {
                const ultimaMsg = c.itens[c.itens.length - 1];
                const isAtiva = ativa?.telefone === c.telefone;
                return (
                  <button
                    key={c.telefone}
                    onClick={() => setSelecionada(c.telefone)}
                    className={`w-full text-left px-3 py-3 border-b hover:bg-secondary/50 transition-colors ${isAtiva ? "bg-secondary" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.nome}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{hora(c.ultima)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {ultimaMsg.resposta_final || ultimaMsg.mensagem_usuario || "—"}
                    </p>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </aside>

        {/* Thread */}
        <section className="flex flex-col min-h-0 bg-[hsl(var(--muted))]/30">
          {!ativa ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageSquare className="h-10 w-10 opacity-30" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b bg-card flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{ativa.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatarTelefone(ativa.telefone)}</p>
                </div>
                <span className="text-xs text-muted-foreground">{ativa.itens.length} mensagens</span>
              </div>
              <ScrollArea className="flex-1 px-5 py-4">
                <div className="space-y-3 max-w-3xl mx-auto">
                  {ativa.itens.map((i) => (
                    <div key={i.id} className="space-y-2">
                      {i.mensagem_usuario && (
                        <div className="flex justify-start">
                          <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-card border px-3.5 py-2 shadow-sm">
                            <p className="text-sm whitespace-pre-wrap break-words">{i.mensagem_usuario}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{hora(i.criado_em)}</p>
                          </div>
                        </div>
                      )}
                      {i.resposta_final && (
                        <div className="flex justify-end">
                          <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2 shadow-sm">
                            <p className="text-[10px] opacity-80 mb-0.5 font-medium">
                              {i.supervisionado ? i.atendente_humano || "Atendente" : "Ana"}
                            </p>
                            <p className="text-sm whitespace-pre-wrap break-words">{i.resposta_final}</p>
                            <p className="text-[10px] opacity-70 mt-1">{hora(i.criado_em)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t bg-card p-3">
                <div className="max-w-3xl mx-auto flex items-end gap-2">
                  <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar(ativa.telefone);
                      }
                    }}
                    placeholder="Continuar a conversa..."
                    rows={1}
                    className="min-h-[42px] max-h-32 resize-none text-sm"
                  />
                  <Button size="icon" onClick={() => enviar(ativa.telefone)} disabled={enviando || !texto.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
