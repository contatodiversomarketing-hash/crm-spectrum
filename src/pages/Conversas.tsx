import { marcarLeadComoLido } from "@/lib/marcarLido";
import { converterParaMp3 } from "@/lib/audioMp3";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BotaoLigar } from "@/contexts/TwilioContext";
import { Search, RefreshCw, MessageSquare, MessagesSquare, Send, Power, UserPlus, Bell, BellOff, Smile, Mic, Square, FileText, Loader2, AudioLines, Paperclip, Pencil, Trash2, Check, X, CheckCheck, AlertCircle, Reply, ArrowDown } from "lucide-react";
import { useChatScroll } from "@/hooks/useChatScroll";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  whatsapp_status: string | null;
  whatsapp_erro: string | null;
}

interface Conversa {
  telefone: string;
  /** Número real para discagem no WhatsApp (com o nono dígito quando existir) */
  numeroEnvio: string;
  nome: string;
  itens: Interacao[];
  ultima: string;
  pendente: boolean;
  ultimaEntrada: string | null;
  pacienteId?: string | null;
  novo?: boolean;
}

interface PacienteResumo {
  id: string;
  nome: string | null;
  telefone: string | null;
}


const EMOJIS = [
  "😀","😄","😊","🙂","😉","😍","🥰","😘","🤗","🤔","😅","😂","🥲","😌","😴","🙏","👍","👏","💪","🙌",
  "❤️","💚","💙","✨","🌟","🎉","✅","❌","⏰","📅","📍","📞","💬","📎","💊","🧠","👶","👩‍⚕️","🩺","💛",
];

function soDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

// Chave única por contato: 55 + DDD + número (ignora DDI/zeros/variações)
function chaveTelefone(v: string) {
  let d = soDigitos(v);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.replace(/^0+/, "");
  // Mantém a mesma identidade usada no recebimento: números brasileiros
  // antigos sem o nono dígito e atuais com o nono dígito ficam no mesmo chat.
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d ? `55${d}` : "";
}


// Número real para enviar no WhatsApp: prefere a forma com o nono dígito.
function numeroDiscagem(...candidatos: (string | null | undefined)[]) {
  let melhor = "";
  for (const c of candidatos) {
    let d = soDigitos(c || "");
    if (!d) continue;
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    d = d.replace(/^0+/, "");
    if (d.length < 10) continue;
    const completo = `55${d}`;
    if (d.length === 11 && d[2] === "9") return completo;
    if (!melhor) melhor = completo;
  }
  if (melhor) {
    const local = melhor.slice(2);
    if (local.length === 10) return `55${local.slice(0, 2)}9${local.slice(2)}`;
  }
  return melhor;
}

function formatarTelefone(v: string) {
  const d = soDigitos(v);
  const semDDI = d.startsWith("55") ? d.slice(2) : d;
  if (semDDI.length >= 10) {
    return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, semDDI.length - 4)}-${semDDI.slice(-4)}`;
  }
  return v;
}

const TAGS: { chave: string; nome: string; cor: string }[] = [
  { chave: "zegestevanin", nome: "José", cor: "--tag-jose" },
  { chave: "vendas02.lavitta", nome: "Fabiana", cor: "--tag-fabiana" },
  { chave: "prospeccao02.medicmuriae", nome: "Maria Rita", cor: "--tag-maria" },
  { chave: "prospeccao.medicmuriae", nome: "Lara", cor: "--tag-lara" },
];
function etiquetaAtendente(itens: Interacao[]): { nome: string; cor: string } | null {
  for (let k = itens.length - 1; k >= 0; k--) {
    const i = itens[k];
    if (!i.resposta_final) continue;
    if (!i.supervisionado) return { nome: "Ana (IA)", cor: "--tag-ana" };
    const a = (i.atendente_humano || "").toLowerCase();
    const t = TAGS.find((x) => a.startsWith(x.chave) || a.includes(x.nome.toLowerCase()));
    if (t) return { nome: t.nome, cor: t.cor };
    return { nome: a.includes("whatsapp") ? "Celular da clínica" : (i.atendente_humano || "Atendente"), cor: "--tag-outro" };
  }
  return null;
}

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}


const RE_MIDIA = /\[midia:(image|audio|document|video):(\S+?)\]/g;

function ConteudoMensagem({ texto, escuro }: { texto: string; escuro?: boolean }) {
  const midias: { tipo: string; url: string }[] = [];
  const limpo = texto.replace(RE_MIDIA, (_m, tipo: string, url: string) => {
    midias.push({ tipo, url });
    return "";
  }).trim();
  return (
    <div className="space-y-2">
      {limpo && <p className="text-sm whitespace-pre-wrap break-words">{limpo}</p>}
      {midias.map((m, idx) => {
        if (m.tipo === "image") {
          return (
            <a key={idx} href={m.url} target="_blank" rel="noreferrer">
              <img src={m.url} alt="Imagem enviada na conversa" className="max-h-64 rounded-lg border" loading="lazy" />
            </a>
          );
        }
        if (m.tipo === "audio") {
          return <audio key={idx} controls src={m.url} className="h-9 w-56 max-w-full" />;
        }
        if (m.tipo === "video") {
          return <video key={idx} controls src={m.url} className="max-h-64 rounded-lg border" />;
        }
        return (
          <a
            key={idx}
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-2 text-xs underline ${escuro ? "opacity-90" : "text-primary"}`}
          >
            <FileText className="h-3.5 w-3.5" /> Abrir arquivo
          </a>
        );
      })}
    </div>
  );
}

export default function Conversas() {
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "pendentes" | "recebidas">("pendentes");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const tel = searchParams.get("telefone");
    if (!tel) return;
    const chave = chaveTelefone(tel);
    if (chave) {
      setFiltro("todas");
      setBusca("");
      setSelecionada(chave);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);


  const [iaAtiva, setIaAtiva] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState<{ autor: string; texto: string } | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const sincronizados = useRef<Set<string>>(new Set());
  const [somAtivo, setSomAtivo] = useState(() => localStorage.getItem("conversas_som") !== "off");
  const ultimoRecebido = useRef<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const tocarAlerta = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1245, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
      osc.onended = () => ctx.close();
    } catch {
      /* som indisponível */
    }
  }, []);

  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const blobParaBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [intRes, leadsRes, pacRes] = await Promise.all([
        supabase
          .from("interacoes_ia")
          .select("id, paciente_externo_id, mensagem_usuario, resposta_final, supervisionado, intencao_detectada, atendente_humano, criado_em, canal, whatsapp_status, whatsapp_erro")
          .order("criado_em", { ascending: false })
          .limit(2000),
        supabase.from("leads").select("nome, telefone").limit(2000),
        supabase.from("pacientes").select("id, nome, telefone").limit(2000),
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
      const listaPac = ((pacRes.data as PacienteResumo[]) || []).filter((p) => soDigitos(p.telefone || "").length >= 10);
      for (const p of listaPac) {
        if (!p.nome) continue;
        const d = soDigitos(p.telefone || "");
        mapa[d] = p.nome;
        mapa[d.startsWith("55") ? d.slice(2) : "55" + d] = p.nome;
      }
      setPacientes(listaPac);
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

  async function salvarEdicao(id: string, campo: "mensagem_usuario" | "resposta_final") {
    const novo = editTexto.trim();
    if (!novo) return;
    const { error } = await supabase.from("interacoes_ia").update({ [campo]: novo }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar", description: error.message, variant: "destructive" });
      return;
    }
    setEditando(null);
    setEditTexto("");
    carregar();

    // Mensagens já entregues não podem ser alteradas no celular da pessoa;
    // oferecemos enviar a correção como uma nova mensagem.
    if (campo === "resposta_final" && ativa) {
      const ok = window.confirm(
        "Texto corrigido aqui na plataforma.\n\nO WhatsApp não permite alterar a mensagem que a pessoa já recebeu. Quer enviar a correção como nova mensagem para ela?",
      );
      if (ok) await enviarTexto(ativa.numeroEnvio, `*Corrigindo a mensagem anterior:* ${novo}`);
    }
  }

  async function apagarMensagem(item: Interacao, campo: "mensagem_usuario" | "resposta_final") {
    if (!confirm("Apagar esta mensagem só aqui na plataforma?\n\nAtenção: ela NÃO é apagada do WhatsApp — o paciente continua vendo.")) return;
    const { error } = await supabase.from("interacoes_ia")
      .update({ [campo]: "🚫 Mensagem apagada apenas da plataforma — continua visível no WhatsApp do paciente." })
      .eq("id", item.id);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Apagada só na plataforma", description: "No WhatsApp do paciente a mensagem continua aparecendo." });
    carregar();
  }

  async function enviarParaCRM(conversa: Conversa) {
    const digits = soDigitos(conversa.telefone);
    const variacoes = Array.from(new Set([digits, digits.startsWith("55") ? digits.slice(2) : "55" + digits]));
    const { data: existente } = await supabase
      .from("leads")
      .select("id")
      .in("telefone", variacoes)
      .limit(1)
      .maybeSingle();

    if (!existente) {
      const { data: pipes } = await supabase.from("pipelines").select("id, nome");
      const pipelineId = pipes?.find((p) => p.nome === "Pacientes")?.id || pipes?.[0]?.id || null;
      const { error } = await supabase.from("leads").insert({
        telefone: digits,
        nome: conversa.nome,
        origem: "cadastro",
        status: "novo",
        status_pipeline: "novo",
        pipeline_id: pipelineId,
      });
      if (error) {
        toast({ title: "Erro ao enviar para o CRM", description: error.message, variant: "destructive" });
        return;
      }
    }
    toast({ title: "Card disponível no CRM", description: conversa.nome });
    navigate("/crm");
  }

  async function enviar(numero: string, confirmarTemplate = false) {
    const digitado = texto.trim();
    if (!digitado || enviando) return;
    const citacao = respondendo
      ? `> *${respondendo.autor}:* ${respondendo.texto.replace(RE_MIDIA, "").trim().slice(0, 300).replace(/\n/g, "\n> ")}\n\n`
      : "";
    const msg = `${citacao}${digitado}`;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
        body: { numero: soDigitos(numero), tipo: "text", texto: msg, confirmarTemplate },
      });
      let payload = data as { error?: string; fora_janela?: boolean; aviso?: string | null; messageId?: string | null };
      if (error && (error as { context?: Response }).context) {
        try {
          payload = await (error as unknown as { context: Response }).context.clone().json();
        } catch { /* mantém erro genérico */ }
      }

      if (payload?.fora_janela) throw new Error(payload.error || "O WhatsApp recusou o envio.");
      if (error || payload?.error) {
        throw new Error(payload?.error || error?.message);
      }
      const retorno = payload;
      const aviso = retorno?.aviso;
      if (aviso) {
        toast({ title: "Conversa iniciada", description: aviso });
      } else {
        setTexto("");
        setRespondendo(null);
      }
      carregar();

      if (retorno?.messageId) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const { data: confirmacao } = await supabase
          .from("interacoes_ia")
          .select("whatsapp_status, whatsapp_erro")
          .eq("whatsapp_message_id", retorno.messageId)
          .maybeSingle();
        if (confirmacao?.whatsapp_status === "failed") {
          toast({
            title: "Mensagem não entregue no WhatsApp",
            description: confirmacao.whatsapp_erro || "O WhatsApp recusou o envio.",
            variant: "destructive",
          });
          carregar();
        }
      }
    } catch (e) {
      toast({ title: "Falha ao enviar", description: String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  // Envia um texto específico (ex.: correção de uma mensagem já enviada).
  async function enviarTexto(numero: string, msg: string) {
    if (!msg.trim()) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
        body: { numero: soDigitos(numero), tipo: "text", texto: msg },
      });
      let payload = data as { error?: string; fora_janela?: boolean };
      if (error && (error as { context?: Response }).context) {
        try {
          payload = await (error as unknown as { context: Response }).context.clone().json();
        } catch { /* mantém erro genérico */ }
      }
      if (payload?.fora_janela) {
        toast({
          title: "Correção não enviada",
          description: "O contato não responde há mais de 24 horas; o WhatsApp só aceita a mensagem de reabordagem.",
          variant: "destructive",
        });
        return;
      }
      if (error || payload?.error) throw new Error(payload?.error || error?.message);
      toast({ title: "Correção enviada no WhatsApp" });
      carregar();
    } catch (e) {
      toast({ title: "Falha ao enviar a correção", description: String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function enviarReabordagem(numero: string) {
    if (enviando) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
        body: { numero: soDigitos(numero), tipo: "text", texto: "Reabordagem", confirmarTemplate: true },
      });
      const payload = data as { error?: string; aviso?: string | null };
      if (error || payload?.error) throw new Error(payload?.error || error?.message);
      toast({ title: "Reabordagem enviada", description: "Aguardando a confirmação de entrega do WhatsApp." });
      carregar();
    } catch (e) {
      toast({ title: "Reabordagem não enviada", description: String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  const enviarMidia = async (numero: string, payload: Record<string, unknown>) => {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
        body: { numero: soDigitos(numero), ...payload },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message);
      }
      carregar();
    } catch (e) {
      toast({ title: "Falha ao enviar", description: String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipoRec = ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const rec = tipoRec ? new MediaRecorder(stream, { mimeType: tipoRec }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: (rec.mimeType || "audio/webm").split(";")[0] }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setGravando(true);
    } catch {
      toast({ title: "Microfone indisponível", description: "Permita o acesso ao microfone.", variant: "destructive" });
    }
  };

  const pararGravacao = () => {
    recorderRef.current?.stop();
    setGravando(false);
  };

  const enviarAudio = async (numero: string) => {
    if (!audioBlob) return;
    const mp3 = await converterParaMp3(audioBlob);
    const base64 = await blobParaBase64(mp3);
    await enviarMidia(numero, { tipo: "audio", base64, fileName: "audio.mp3", mimeType: "audio/mpeg" });
    setAudioBlob(null);
  };

  const enviarArquivo = async (numero: string, file: File) => {
    const base64 = await blobParaBase64(file);
    const tipo = file.type.startsWith("image/") ? "image" : "document";
    await enviarMidia(numero, { tipo, base64, fileName: file.name, mimeType: file.type, texto: texto || "" });
    setTexto("");
  };

  const transcreverAudio = async () => {
    if (!audioBlob) return;
    setTranscrevendo(true);
    try {
      const base64 = await blobParaBase64(audioBlob);
      const { data, error } = await supabase.functions.invoke("transcrever-audio", {
        body: { audio: base64, format: "webm" },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message);
      }
      const t = (data as { texto?: string })?.texto || "";
      setTexto((p) => (p ? `${p} ${t}` : t));
      toast({ title: "Áudio transcrito" });
    } catch (e) {
      toast({ title: "Erro ao transcrever", description: String(e), variant: "destructive" });
    } finally {
      setTranscrevendo(false);
    }
  };

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


  useEffect(() => {
    const recebidas = interacoes.filter((i) => i.mensagem_usuario);
    if (!recebidas.length) return;
    const maisRecente = recebidas.reduce((a, b) => (a.criado_em > b.criado_em ? a : b));
    if (ultimoRecebido.current === null) {
      ultimoRecebido.current = maisRecente.criado_em;
      return;
    }
    if (maisRecente.criado_em > ultimoRecebido.current) {
      ultimoRecebido.current = maisRecente.criado_em;
      if (somAtivo) tocarAlerta();
    }
  }, [interacoes, somAtivo, tocarAlerta]);

  const conversas = useMemo<Conversa[]>(() => {
    const grupos: Record<string, Interacao[]> = {};
    for (const i of interacoes) {
      const tel = chaveTelefone(i.paciente_externo_id.replace("tel:", ""));
      if (!tel) continue;
      if (!grupos[tel]) grupos[tel] = [];
      grupos[tel].push(i);
    }


    const mapaPacientes: Record<string, PacienteResumo> = {};
    for (const p of pacientes) {
      const k = chaveTelefone(p.telefone || "");
      if (k) mapaPacientes[k] = p;
    }

    const base: Conversa[] = Object.entries(grupos).map(([telefone, itens]) => {
      const ordenados = [...itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
      const digits = soDigitos(telefone);
      const nome =
        mapaPacientes[telefone]?.nome ||
        nomes[digits] ||
        nomes[digits.startsWith("55") ? digits.slice(2) : "55" + digits] ||
        formatarTelefone(telefone);
      const ultimaEntrada =
        [...ordenados].reverse().find((i) => i.mensagem_usuario)?.criado_em || null;
      const ultimaSaida =
        [...ordenados].reverse().find((i) => i.resposta_final)?.criado_em || null;
      const pendente = !!ultimaEntrada && (!ultimaSaida || ultimaSaida < ultimaEntrada);
      return {
        telefone,
        numeroEnvio:
          numeroDiscagem(
            mapaPacientes[telefone]?.telefone,
            ...[...ordenados].reverse().map((i) => i.paciente_externo_id.replace("tel:", "")),
            telefone,
          ) || telefone,
        nome,
        itens: ordenados,
        ultima: ordenados[ordenados.length - 1].criado_em,
        pendente,
        ultimaEntrada,
        pacienteId: mapaPacientes[telefone]?.id ?? null,
      };
    });

    const comConversa = new Set(base.map((c) => c.telefone));
    const termo = busca.trim().toLowerCase();
    const novos: Conversa[] = pacientes
      .map((p) => ({ p, tel: chaveTelefone(p.telefone || "") }))
      .filter(({ p, tel }) => {
        if (!tel || comConversa.has(tel)) return false;
        if (selecionada === tel) return true;
        if (!termo) return filtro === "todas";
        const d = soDigitos(termo);
        return (p.nome || "").toLowerCase().includes(termo) || (!!d && soDigitos(tel).includes(d));
      })
      .map(({ p, tel }) => ({
        telefone: tel,
        numeroEnvio: numeroDiscagem(p.telefone, tel) || tel,
        nome: p.nome || formatarTelefone(tel),
        itens: [],
        ultima: "",
        pendente: false,
        ultimaEntrada: null,
        pacienteId: p.id,
        novo: true,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));


    const termoDigitos = soDigitos(busca);
    const filtradas = base
      .filter((c) =>
        !termo ||
        c.nome.toLowerCase().includes(termo) ||
        (!!termoDigitos && soDigitos(c.telefone).includes(termoDigitos))
      )
      .filter((c) => (termo ? true : filtro === "pendentes" ? c.pendente : filtro === "recebidas" ? !!c.ultimaEntrada : true))
      .sort((a, b) => {
        const chave = (c: Conversa) => (filtro === "todas" ? c.ultima : c.ultimaEntrada || c.ultima);
        return chave(b).localeCompare(chave(a));
      });

    return [...filtradas, ...novos];
  }, [interacoes, nomes, busca, filtro, pacientes, selecionada]);

  const totalPendentes = useMemo(
    () => conversas.filter((c) => c.pendente).length,
    [conversas],
  );


  // Nunca troca sozinha de conversa: a primeira é fixada e só muda quando alguém clica em outra.
  useEffect(() => {
    if (!selecionada && conversas[0]) setSelecionada(conversas[0].telefone);
  }, [selecionada, conversas]);
  const ativa = conversas.find((c) => c.telefone === selecionada) || (selecionada ? undefined : conversas[0]);
  const chatScroll = useChatScroll(
    ativa ? `${ativa.itens.length}:${ativa.itens[ativa.itens.length - 1]?.id ?? ""}` : "",
    ativa?.telefone ?? "",
  );

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
            <Button
              variant="outline"
              size="sm"
              title={somAtivo ? "Som de alerta ativo" : "Som de alerta desligado"}
              onClick={() => {
                const novo = !somAtivo;
                setSomAtivo(novo);
                localStorage.setItem("conversas_som", novo ? "on" : "off");
                if (novo) tocarAlerta();
              }}
            >
              {somAtivo ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-[calc(100vh-73px)]">
        {/* Lista de conversas */}
        <aside className="border-r bg-card/40 flex flex-col min-h-0">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato ou paciente..." className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex gap-1">
              {([
                ["pendentes", `Sem resposta${totalPendentes ? ` (${totalPendentes})` : ""}`],
                ["recebidas", "Recebidas"],
                ["todas", "Todas"],
              ] as const).map(([chave, rotulo]) => (
                <button
                  key={chave}
                  onClick={() => setFiltro(chave)}
                  className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    filtro === chave ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
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
                  <div key={c.telefone} className={`flex items-center border-b hover:bg-secondary/50 transition-colors ${isAtiva ? "bg-secondary" : ""}`}>
                  <button
                    onClick={() => { setSelecionada(c.telefone); marcarLeadComoLido(c.telefone); }}
                    className="flex-1 min-w-0 text-left px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.nome}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{c.ultima ? hora(c.ultima) : "novo"}</span>
                    </div>
                    {(() => { const tg = etiquetaAtendente(c.itens); return tg ? (
                      <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-primary-foreground" style={{ backgroundColor: `hsl(var(${tg.cor}))` }}>
                        {tg.nome}
                      </span>
                    ) : null; })()}
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {ultimaMsg
                          ? (ultimaMsg.mensagem_usuario || ultimaMsg.resposta_final || "—").replace(/\[midia:\w+:\S+?\]/g, "📎 mídia")
                          : "Paciente cadastrado — iniciar conversa"}
                      </p>
                      {c.pendente && (
                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold text-secondary-foreground">
                          sem resposta
                        </span>
                      )}
                    </div>
                  </button>
                  <BotaoLigar telefone={c.numeroEnvio || c.telefone} nome={c.nome} pacienteId={c.pacienteId} className="h-7 w-7 mr-2 shrink-0" />
                  </div>
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
                <div className="flex items-center gap-2">
                  <BotaoLigar telefone={ativa.numeroEnvio || ativa.telefone} nome={ativa.nome} pacienteId={ativa.pacienteId} className="h-8 w-8 border" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate(
                        ativa.pacienteId
                          ? `/pacientes?paciente=${ativa.pacienteId}`
                          : `/pacientes?telefone=${encodeURIComponent(formatarTelefone(ativa.telefone))}`
                      )
                    }
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    {ativa.pacienteId ? "Abrir cadastro" : "Cadastrar paciente"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => enviarParaCRM(ativa)}>
                    <MessagesSquare className="h-4 w-4 mr-1.5" />
                    Enviar para o CRM
                  </Button>
                  <span className="text-xs text-muted-foreground">{ativa.itens.length} mensagens</span>
                </div>
              </div>
              <div className="relative flex-1 min-h-0">
              <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="h-full overflow-y-auto px-5 py-4">
                <div className="space-y-3 max-w-3xl mx-auto">
                  {ativa.itens.map((i) => (
                    <div key={i.id} className="space-y-2">
                      {i.mensagem_usuario && (
                        <div className="flex justify-start items-center gap-1 group">
                          <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-card border px-3.5 py-2 shadow-sm">
                            {editando === `${i.id}:in` ? (
                              <div className="flex items-center gap-1">
                                <Input value={editTexto} onChange={(e) => setEditTexto(e.target.value)} className="h-8 text-sm" />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => salvarEdicao(i.id, "mensagem_usuario")}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <ConteudoMensagem texto={i.mensagem_usuario} />
                                <p className="text-[10px] text-muted-foreground mt-1">{hora(i.criado_em)}</p>
                              </>
                            )}
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Responder" onClick={() => setRespondendo({ autor: ativa.nome, texto: i.mensagem_usuario || "" })}>
                              <Reply className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { setEditando(`${i.id}:in`); setEditTexto(i.mensagem_usuario || ""); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Apagar" onClick={() => apagarMensagem(i, "mensagem_usuario")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {i.resposta_final && (
                        <div className="flex justify-end items-center gap-1 group">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Responder" onClick={() => setRespondendo({ autor: i.supervisionado ? i.atendente_humano || "Atendente" : "Ana", texto: i.resposta_final || "" })}>
                              <Reply className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { setEditando(`${i.id}:out`); setEditTexto(i.resposta_final || ""); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Apagar" onClick={() => apagarMensagem(i, "resposta_final")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2 shadow-sm">
                            <p className="text-[10px] opacity-80 mb-0.5 font-medium">
                              {i.supervisionado ? i.atendente_humano || "Atendente" : "Ana"}
                            </p>
                            {editando === `${i.id}:out` ? (
                              <div className="flex items-center gap-1">
                                <Input value={editTexto} onChange={(e) => setEditTexto(e.target.value)} className="h-8 text-sm text-foreground" />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => salvarEdicao(i.id, "resposta_final")}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <ConteudoMensagem texto={i.resposta_final} escuro />
                                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
                                  <span>{hora(i.criado_em)}</span>
                                  {i.whatsapp_status === "failed" ? (
                                    <span className="flex items-center gap-1 font-medium" title={i.whatsapp_erro || "Falha no envio pelo WhatsApp"}>
                                      <AlertCircle className="h-3 w-3" /> Não entregue
                                      {/24 hours|24 horas|131047/i.test(i.whatsapp_erro || "") && (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="ml-1 h-6 px-2 text-[10px]"
                                          disabled={enviando}
                                          onClick={() => ativa && enviarReabordagem(ativa.numeroEnvio)}
                                        >
                                          Reabrir conversa
                                        </Button>
                                      )}
                                    </span>
                                  ) : i.whatsapp_status === "read" ? (
                                    <CheckCheck className="h-3.5 w-3.5" aria-label="Lida" />
                                  ) : i.whatsapp_status === "delivered" ? (
                                    <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />
                                  ) : i.whatsapp_status ? (
                                    <Check className="h-3.5 w-3.5" aria-label="Enviada" />
                                  ) : null}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {chatScroll.showJump && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-4 right-6 h-10 w-10 rounded-full shadow-md border"
                  title="Ir para a última mensagem"
                  aria-label="Ir para a última mensagem"
                  onClick={() => chatScroll.toBottom(true)}
                >
                  <ArrowDown className="h-5 w-5" />
                </Button>
              )}
              </div>
              <div className="border-t bg-card p-3">
                <div className="max-w-3xl mx-auto space-y-2">
                  {respondendo && (
                    <div className="flex items-start gap-2 rounded-md border-l-4 border-primary bg-muted/50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-primary">{respondendo.autor}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {respondendo.texto.replace(RE_MIDIA, "").trim() || "Mídia"}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Cancelar resposta" onClick={() => setRespondendo(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {audioBlob && (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      <AudioLines className="h-4 w-4 text-primary shrink-0" />
                      <audio controls src={URL.createObjectURL(audioBlob)} className="h-8 flex-1" />
                      <Button size="sm" variant="outline" onClick={transcreverAudio} disabled={transcrevendo} title="Transcrever">
                        {transcrevendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" onClick={() => enviarAudio(ativa.numeroEnvio)} disabled={enviando} title="Enviar áudio">
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAudioBlob(null)}>×</Button>
                    </div>
                  )}
                <div className="flex items-end gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" title="Emojis">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <div className="grid grid-cols-8 gap-1">
                        {EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            className="text-lg hover:bg-secondary rounded"
                            onClick={() => setTexto((p) => p + e)}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) enviarArquivo(ativa.numeroEnvio, f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" title="Anexar" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={gravando ? "destructive" : "ghost"}
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    title={gravando ? "Parar gravação" : "Gravar áudio"}
                    onClick={() => (gravando ? pararGravacao() : iniciarGravacao())}
                  >
                    {gravando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar(ativa.numeroEnvio);
                      }
                    }}
                    placeholder="Continuar a conversa..."
                    rows={1}
                    className="min-h-[42px] max-h-32 resize-none text-sm"
                  />
                  <Button size="icon" onClick={() => enviar(ativa.numeroEnvio)} disabled={enviando || !texto.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
