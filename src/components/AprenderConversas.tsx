import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ImagePlus, Loader2, Sparkles, X, Save } from "lucide-react";

interface Regra {
  categoria: string;
  titulo: string;
  instrucao: string;
}

interface Exemplo {
  situacao?: string;
  paciente?: string;
  atendente?: string;
}

interface Analise {
  resumo: string;
  transcricao: string;
  regras: Regra[];
  exemplos: Exemplo[];
}

export default function AprenderConversas() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prints, setPrints] = useState<{ nome: string; url: string }[]>([]);
  const [texto, setTexto] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [selecionadas, setSelecionadas] = useState<Record<number, boolean>>({});
  const [salvarExemplos, setSalvarExemplos] = useState(true);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (prints.length + files.length > 10) {
      toast.error("Máximo de 10 prints por análise.");
      return;
    }

    setUploading(true);
    try {
      const novos: { nome: string; url: string }[] = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`"${file.name}" é maior que 10MB e foi ignorado.`);
          continue;
        }
        const ext = file.name.split(".").pop();
        const path = `conversas/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("treinamento-arquivos").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("treinamento-arquivos").getPublicUrl(path);
        novos.push({ nome: file.name, url: data.publicUrl });
      }
      setPrints((p) => [...p, ...novos]);
    } catch (err: any) {
      toast.error("Erro ao enviar prints: " + (err.message || ""));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const analisar = async () => {
    if (prints.length === 0 && !texto.trim()) {
      toast.error("Anexe prints ou cole o texto da conversa.");
      return;
    }
    setAnalisando(true);
    setAnalise(null);
    try {
      const { data, error } = await supabase.functions.invoke("aprender-conversas", {
        body: { imagens: prints.map((p) => p.url), texto },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAnalise(data as Analise);
      const sel: Record<number, boolean> = {};
      (data.regras || []).forEach((_: Regra, i: number) => (sel[i] = true));
      setSelecionadas(sel);
      toast.success(`${data.regras?.length || 0} regras extraídas da conversa.`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao analisar a conversa.");
    } finally {
      setAnalisando(false);
    }
  };

  const salvar = async () => {
    if (!analise) return;
    const escolhidas = analise.regras.filter((_, i) => selecionadas[i]);
    if (escolhidas.length === 0 && !salvarExemplos) {
      toast.error("Selecione ao menos uma regra.");
      return;
    }

    setSalvando(true);
    try {
      const rows: any[] = escolhidas.map((r) => ({
        categoria: r.categoria,
        titulo: r.titulo,
        instrucao: r.instrucao,
        canal: "ambos",
        ativo: true,
      }));

      if (salvarExemplos && (analise.exemplos?.length || analise.transcricao)) {
        const exemplosTexto = (analise.exemplos || [])
          .map(
            (e) =>
              `Situação: ${e.situacao || "-"}\nPaciente: ${e.paciente || "-"}\nAtendente (imite este estilo): ${e.atendente || "-"}`,
          )
          .join("\n\n");
        rows.push({
          categoria: "atendimento",
          titulo: `Exemplos reais de conversa — ${new Date().toLocaleDateString("pt-BR")}`,
          instrucao:
            "Use os exemplos abaixo como referência de estilo e imite a forma de escrever do atendente humano ao responder situações parecidas.\n\n" +
            exemplosTexto,
          canal: "ambos",
          ativo: true,
          anexo_nome: "conversa-transcrita.txt",
          anexo_tipo: "text/plain",
          anexo_conteudo_extraido: analise.transcricao,
        });
      }

      const { error } = await supabase.from("treinamento_ia").insert(rows);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["treinamento-ia"] });
      toast.success(`${rows.length} itens de treinamento salvos! A SofIA já está aplicando.`);
      setAnalise(null);
      setPrints([]);
      setTexto("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Aprender com suas conversas
          </CardTitle>
          <CardDescription>
            Envie prints do WhatsApp (ou cole o texto). A SofIA lê a conversa, aprende o seu jeito de atender e
            transforma em regras que você aprova antes de ativar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={handleFiles}
          />

          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed h-20 flex flex-col gap-1"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs">Enviando prints...</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Clique para anexar prints da conversa (até 10 imagens)</span>
              </>
            )}
          </Button>

          {prints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {prints.map((p, i) => (
                <div key={p.url} className="relative">
                  <img src={p.url} alt={`Print da conversa ${i + 1}`} className="h-24 w-24 object-cover rounded border" />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-5 w-5 absolute -top-1 -right-1"
                    onClick={() => setPrints((prev) => prev.filter((x) => x.url !== p.url))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>Texto da conversa (opcional)</Label>
            <Textarea
              rows={5}
              placeholder="Cole aqui a conversa exportada do WhatsApp, se preferir."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>

          <Button onClick={analisar} disabled={analisando || uploading} className="w-full">
            {analisando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando conversa...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Analisar e aprender
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {analise && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Revise o que a SofIA aprendeu</CardTitle>
            <CardDescription>{analise.resumo}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {analise.regras.map((r, i) => (
              <div key={i} className="flex gap-3 border rounded-lg p-3">
                <Checkbox
                  checked={!!selecionadas[i]}
                  onCheckedChange={(v) => setSelecionadas((s) => ({ ...s, [i]: !!v }))}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.titulo}</span>
                    <Badge variant="outline" className="text-xs">{r.categoria}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.instrucao}</p>
                </div>
              </div>
            ))}

            {(analise.exemplos?.length > 0 || analise.transcricao) && (
              <div className="flex gap-3 border rounded-lg p-3 bg-muted/40">
                <Checkbox checked={salvarExemplos} onCheckedChange={(v) => setSalvarExemplos(!!v)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    Guardar {analise.exemplos?.length || 0} trechos como exemplos de estilo
                  </p>
                  <details className="mt-1">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Ver transcrição</summary>
                    <pre className="mt-1 text-xs bg-background p-2 rounded max-h-60 overflow-auto whitespace-pre-wrap">
                      {analise.transcricao}
                    </pre>
                  </details>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Aprovar e ativar
              </Button>
              <Button variant="outline" onClick={() => setAnalise(null)}>
                <X className="h-4 w-4 mr-1" /> Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
