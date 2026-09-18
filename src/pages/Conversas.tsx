import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, RefreshCw, MessageSquare, MessagesSquare, Send, Power, UserPlus, Bell, BellOff, Smile, Mic, Square, FileText, Loader2, AudioLines, Paperclip, Pencil, Trash2, Check, X, CheckCheck, AlertCircle } from "lucide-react";
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
  }

  async function apagarMensagem(item: Interacao, campo: "mensagem_usuario" | "resposta_final") {
    const outro = campo === "mensagem_usuario" ? item.resposta_final : item.mensagem_usuario;
    const query = outro
      ? supabase.from("interacoes_ia").update({ [campo]: null }).eq("id", item.id)
      : supabase.from("interacoes_ia").delete().eq("id", item.id);
    const { error } = await query;
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mensagem apagada", description: "Removida apenas aqui na plataforma." });
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
    const msg = texto.trim();
    if (!msg || enviando) return;
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

      if (payload?.fora_janela) {
        const ok = window.confirm(
          "Este contato não responde há mais de 24 horas.\n\nO WhatsApp não entrega o texto que você digitou. Deseja enviar a mensagem de reabordagem aprovada para reabrir a conversa?",
        );
        setEnviando(false);
        if (ok) await enviar(numero, true);
        return;
      }
      if (error || payload?.error) {
        throw new Error(payload?.error || error?.message);
      }
      const retorno = payload;
      const aviso = retorno?.aviso;
      if (aviso) toast({ title: "Mensagem de reabordagem", description: aviso });
      setTexto("");
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
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
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
    const base64 = await blobParaBase64(audioBlob);
    await enviarMidia(numero, { tipo: "audio", base64, fileName: "audio.webm", mimeType: "audio/webm" });
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
                  <button
                    key={c.telefone}
                    onClick={() => setSelecionada(c.telefone)}
                    className={`w-full text-left px-3 py-3 border-b hover:bg-secondary/50 transition-colors ${isAtiva ? "bg-secondary" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.nome}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{c.ultima ? hora(c.ultima) : "novo"}</span>
                    </div>
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
              <ScrollArea className="flex-1 px-5 py-4">
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
                                          onClick={() => selecionada && enviarReabordagem(selecionada)}
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
              </ScrollArea>
              <div className="border-t bg-card p-3">
                <div className="max-w-3xl mx-auto space-y-2">
                  {audioBlob && (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      <AudioLines className="h-4 w-4 text-primary shrink-0" />
                      <audio controls src={URL.createObjectURL(audioBlob)} className="h-8 flex-1" />
                      <Button size="sm" variant="outline" onClick={transcreverAudio} disabled={transcrevendo} title="Transcrever">
                        {transcrevendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" onClick={() => enviarAudio(ativa.telefone)} disabled={enviando} title="Enviar áudio">
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
                      if (f) enviarArquivo(ativa.telefone, f);
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
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
