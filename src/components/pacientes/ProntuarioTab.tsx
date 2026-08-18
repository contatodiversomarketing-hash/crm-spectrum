import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mic, Square, Paperclip, FileText, Trash2, Loader2, Download } from "lucide-react";

interface Registro {
  id: string;
  tipo: string;
  titulo: string | null;
  conteudo: string;
  audio_path: string | null;
  autor_nome: string | null;
  criado_em: string;
}
interface Anexo {
  id: string;
  nome: string;
  path: string;
  mime: string | null;
  criado_em: string;
}

export function ProntuarioTab({ pacienteId, autorNome }: { pacienteId: string; autorNome: string }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const carregar = useCallback(async () => {
    const [r, a] = await Promise.all([
      supabase.from("prontuario_registros").select("id, tipo, titulo, conteudo, audio_path, autor_nome, criado_em")
        .eq("paciente_id", pacienteId).order("criado_em", { ascending: false }),
      supabase.from("prontuario_anexos").select("id, nome, path, mime, criado_em")
        .eq("paciente_id", pacienteId).order("criado_em", { ascending: false }),
    ]);
    setRegistros((r.data ?? []) as Registro[]);
    setAnexos((a.data ?? []) as Anexo[]);
  }, [pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarRegistro = async (tipo: "texto" | "audio") => {
    if (!conteudo.trim()) { toast.error("Escreva ou grave algo antes de salvar"); return; }
    setSalvando(true);
    const { error } = await supabase.from("prontuario_registros").insert({
      paciente_id: pacienteId, tipo, titulo: titulo || null, conteudo, autor_nome: autorNome,
    });
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    setTitulo(""); setConteudo("");
    toast.success("Registro adicionado ao prontuário");
    carregar();
  };

  const excluirRegistro = async (id: string) => {
    const { error } = await supabase.from("prontuario_registros").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    carregar();
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setTranscrevendo(true);
        try {
          const base64 = await new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(",")[1]);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          const formato = (rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
          const { data, error } = await supabase.functions.invoke("transcrever-audio", {
            body: { audio: base64, format: formato },
          });
          if (error) throw error;
          const texto = (data as { texto?: string })?.texto ?? "";
          if (!texto) throw new Error("Transcrição vazia");
          setConteudo((c) => (c ? c + "\n\n" : "") + texto);
          toast.success("Áudio transcrito");
        } catch (e) {
          toast.error("Não foi possível transcrever o áudio");
          console.error(e);
        } finally {
          setTranscrevendo(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setGravando(true);
    } catch {
      toast.error("Permissão de microfone negada");
    }
  };

  const pararGravacao = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGravando(false);
  };

  const enviarAnexo = async (file: File) => {
    const permitido = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!permitido.includes(file.type)) { toast.error("Envie apenas JPG, PNG ou PDF"); return; }
    setEnviando(true);
    const path = `${pacienteId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("prontuarios").upload(path, file);
    if (upErr) { setEnviando(false); toast.error("Erro no upload: " + upErr.message); return; }
    const { error } = await supabase.from("prontuario_anexos").insert({
      paciente_id: pacienteId, nome: file.name, path, mime: file.type, tamanho: file.size,
    });
    setEnviando(false);
    if (error) { toast.error("Erro ao salvar anexo"); return; }
    toast.success("Anexo enviado");
    carregar();
  };

  const abrirAnexo = async (a: Anexo) => {
    const { data, error } = await supabase.storage.from("prontuarios").createSignedUrl(a.path, 3600);
    if (error || !data) { toast.error("Não foi possível abrir o arquivo"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const excluirAnexo = async (a: Anexo) => {
    await supabase.storage.from("prontuarios").remove([a.path]);
    await supabase.from("prontuario_anexos").delete().eq("id", a.id);
    carregar();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="space-y-1.5">
          <Label>Título da evolução</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Consulta de retorno" />
        </div>
        <div className="space-y-1.5">
          <Label>Registro clínico</Label>
          <Textarea rows={6} value={conteudo} onChange={(e) => setConteudo(e.target.value)}
            placeholder="Escreva a evolução ou grave um áudio para transcrever automaticamente..." />
        </div>
        <div className="flex flex-wrap gap-2">
          {!gravando ? (
            <Button type="button" variant="outline" onClick={iniciarGravacao} disabled={transcrevendo}>
              {transcrevendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mic className="h-4 w-4 mr-1" />}
              {transcrevendo ? "Transcrevendo..." : "Gravar áudio"}
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={pararGravacao}>
              <Square className="h-4 w-4 mr-1" /> Parar e transcrever
            </Button>
          )}
          <Button type="button" onClick={() => salvarRegistro(conteudo ? "texto" : "texto")} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar no prontuário"}
          </Button>
          <label className="inline-flex">
            <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); e.target.value = ""; }} />
            <span className="inline-flex items-center rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted">
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Paperclip className="h-4 w-4 mr-1" />}
              Anexar JPG/PNG/PDF
            </span>
          </label>
        </div>
      </div>

      {anexos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Anexos ({anexos.length})</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {anexos.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{a.nome}</span>
                <button onClick={() => abrirAnexo(a)} className="text-muted-foreground hover:text-foreground">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => excluirAnexo(a)} className="text-destructive/70 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">Evoluções ({registros.length})</p>
        {registros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>}
        {registros.map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.titulo || "Evolução clínica"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(r.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {r.autor_nome ? ` · ${r.autor_nome}` : ""}
                </p>
              </div>
              <button onClick={() => excluirRegistro(r.id)} className="text-destructive/70 hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{r.conteudo}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
