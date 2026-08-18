import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Smile, Paperclip, Mic, Send, Square, Loader2, FileText, AudioLines } from "lucide-react";

const EMOJIS = [
  "😀","😄","😊","🙂","😉","😍","🥰","😘","🤗","🤔","😅","😂","🥲","😌","😴","🙏","👍","👏","💪","🙌",
  "❤️","💚","💙","✨","🌟","🎉","✅","❌","⏰","📅","📍","📞","💬","📎","💊","🧠","👶","👩‍⚕️","🩺","💛",
];

interface Msg {
  id: string;
  mensagem_usuario: string | null;
  resposta_final: string | null;
  resposta_sugerida: string | null;
  atendente_humano: string | null;
  criado_em: string;
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

export function LeadChatDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  telefone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  telefone: string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const numero = onlyDigits(telefone || "");

  const fetchMessages = useCallback(async () => {
    if (!numero) return;
    const { data, error } = await supabase
      .from("interacoes_ia")
      .select("id, mensagem_usuario, resposta_final, resposta_sugerida, atendente_humano, criado_em")
      .eq("paciente_externo_id", numero)
      .order("criado_em", { ascending: true })
      .limit(300);
    if (!error && data) setMessages(data as Msg[]);
  }, [numero]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    const t = setInterval(fetchMessages, 6000);
    return () => clearInterval(t);
  }, [open, fetchMessages]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const invokeSend = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
      body: { numero, leadId, ...payload },
    });
    if (error || (data as any)?.error) {
      throw new Error((data as any)?.error || error?.message || "Falha no envio");
    }
  };

  const enviarTexto = async () => {
    if (!texto.trim() || !numero) return;
    setSending(true);
    try {
      await invokeSend({ tipo: "text", texto });
      setTexto("");
      await fetchMessages();
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const enviarArquivo = async (file: File) => {
    setSending(true);
    try {
      const base64 = await blobToBase64(file);
      const tipo = file.type.startsWith("image/") ? "image" : "document";
      await invokeSend({ tipo, base64, fileName: file.name, mimeType: file.type, texto: texto || "" });
      setTexto("");
      await fetchMessages();
    } catch (e: any) {
      toast({ title: "Erro ao enviar arquivo", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
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
      setRecording(true);
    } catch {
      toast({ title: "Microfone indisponível", description: "Permita o acesso ao microfone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const enviarAudio = async () => {
    if (!audioBlob) return;
    setSending(true);
    try {
      const base64 = await blobToBase64(audioBlob);
      await invokeSend({ tipo: "audio", base64, fileName: "audio.webm", mimeType: "audio/webm" });
      setAudioBlob(null);
      await fetchMessages();
    } catch (e: any) {
      toast({ title: "Erro ao enviar áudio", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const transcreverAudio = async () => {
    if (!audioBlob) return;
    setTranscribing(true);
    try {
      const base64 = await blobToBase64(audioBlob);
      const { data, error } = await supabase.functions.invoke("transcrever-audio", {
        body: { audio: base64, format: "webm" },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setTexto((p) => (p ? `${p} ${(data as any).texto}` : (data as any).texto));
      toast({ title: "Áudio transcrito" });
    } catch (e: any) {
      toast({ title: "Erro ao transcrever", description: e.message, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-base">{leadNome}</DialogTitle>
          <DialogDescription className="text-xs">
            {numero ? `WhatsApp • ${telefone}` : "Lead sem telefone cadastrado"}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/30">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-6">Carregando conversa...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhuma mensagem ainda.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="space-y-2">
                {m.mensagem_usuario && (
                  <div className="flex justify-start">
                    <div className="bg-card border px-3 py-2 rounded-2xl rounded-tl-sm max-w-[80%] text-sm whitespace-pre-wrap break-words shadow-sm">
                      {m.mensagem_usuario}
                      <span className="block text-[10px] text-muted-foreground mt-1">
                        {new Date(m.criado_em).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                )}
                {(m.resposta_final || m.resposta_sugerida) && (
                  <div className="flex justify-end">
                    <div className="bg-primary text-primary-foreground px-3 py-2 rounded-2xl rounded-tr-sm max-w-[80%] text-sm whitespace-pre-wrap break-words shadow-sm">
                      {m.resposta_final || m.resposta_sugerida}
                      <span className="block text-[10px] opacity-75 mt-1">
                        {m.atendente_humano ? m.atendente_humano : "Ana"} •{" "}
                        {new Date(m.criado_em).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 space-y-2 bg-background">
          {audioBlob && (
            <div className="flex items-center gap-2 rounded-md border p-2">
              <AudioLines className="h-4 w-4 text-primary shrink-0" />
              <audio controls src={URL.createObjectURL(audioBlob)} className="h-8 flex-1" />
              <Button size="sm" variant="outline" onClick={transcreverAudio} disabled={transcribing}>
                {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" onClick={enviarAudio} disabled={sending}>
                <Send className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAudioBlob(null)}>×</Button>
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Emojis">
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="text-lg hover:bg-muted rounded"
                      onClick={() => setTexto((p) => p + e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Anexar PDF ou imagem"
              onClick={() => fileRef.current?.click()}
              disabled={sending || !numero}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) enviarArquivo(f);
                e.target.value = "";
              }}
            />

            <Textarea
              ref={textareaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviarTexto();
                }
              }}
              placeholder={numero ? "Digite uma mensagem..." : "Cadastre um telefone para conversar"}
              disabled={!numero}
              className="min-h-[40px] max-h-28 resize-none"
            />

            {recording ? (
              <Button variant="destructive" size="icon" className="h-9 w-9 shrink-0" onClick={stopRecording} title="Parar gravação">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={startRecording}
                disabled={!numero || sending}
                title="Gravar áudio"
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}

            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={enviarTexto}
              disabled={sending || !texto.trim() || !numero}
              title="Enviar"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
