import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Brain, Plus, Trash2, Edit2, Save, X, ArrowLeft, MessageSquare, Phone, Globe, Paperclip, FileText, Image, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ChatTreinamento from "@/components/ChatTreinamento";
import AprenderConversas from "@/components/AprenderConversas";


interface Treinamento {
  id: string;
  categoria: string;
  titulo: string;
  instrucao: string;
  ativo: boolean;
  canal: string;
  criado_em: string;
  atualizado_em: string;
  anexo_url?: string | null;
  anexo_tipo?: string | null;
  anexo_nome?: string | null;
  anexo_conteudo_extraido?: string | null;
}

const CATEGORIAS = [
  { value: "fatos_oficiais", label: "Fatos oficiais (a Ana nunca inventa fora disso)" },
  { value: "especialidades", label: "Especialidades & Profissionais" },
  { value: "agendamento", label: "Fluxo de Agendamento" },
  { value: "vendas", label: "Técnicas de Venda" },
  { value: "atendimento", label: "Atendimento & Tom" },
  { value: "servicos", label: "Serviços da Clínica" },
  { value: "objecoes", label: "Objeções" },
  { value: "geral", label: "Geral" },
];

const CANAIS = [
  { value: "ambos", label: "WhatsApp + Voz", icon: Globe },
  { value: "whatsapp", label: "Apenas WhatsApp", icon: MessageSquare },
  { value: "voz", label: "Apenas Voz", icon: Phone },
];

const ACCEPTED_FILE_TYPES = ".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp";

export default function TreinamentoIA() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = hasRole("admin");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ titulo: "", instrucao: "", categoria: "geral", canal: "ambos" });
  const [anexo, setAnexo] = useState<{ file: File; url?: string; nome: string; tipo: string; conteudo?: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: treinamentos = [], isLoading } = useQuery({
    queryKey: ["treinamento-ia"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treinamento_ia")
        .select("*")
        .order("categoria")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as Treinamento[];
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("treinamento-arquivos")
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("treinamento-arquivos")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // Extract content via edge function
      toast.info("Extraindo conteúdo do arquivo...");
      
      const { data: extractData, error: extractError } = await supabase.functions.invoke(
        "extrair-conteudo-arquivo",
        {
          body: {
            file_url: publicUrl,
            file_type: file.type,
            file_name: file.name,
          },
        }
      );

      if (extractError) throw extractError;

      const conteudo = extractData?.conteudo || "";
      
      setAnexo({
        file,
        url: publicUrl,
        nome: file.name,
        tipo: file.type,
        conteudo,
      });

      toast.success(`Arquivo "${file.name}" processado com sucesso!`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro ao processar arquivo: " + (err.message || "Tente novamente"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const upsertMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string }) => {
      const payload: any = {
        titulo: data.titulo,
        instrucao: data.instrucao,
        categoria: data.categoria,
        canal: data.canal,
      };

      if (anexo) {
        payload.anexo_url = anexo.url;
        payload.anexo_tipo = anexo.tipo;
        payload.anexo_nome = anexo.nome;
        payload.anexo_conteudo_extraido = anexo.conteudo;
      }

      if (data.id) {
        const { error } = await supabase.from("treinamento_ia").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("treinamento_ia").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treinamento-ia"] });
      setShowForm(false);
      setEditId(null);
      setForm({ titulo: "", instrucao: "", categoria: "geral", canal: "ambos" });
      setAnexo(null);
      toast.success(editId ? "Instrução atualizada!" : "Instrução adicionada!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("treinamento_ia").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["treinamento-ia"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("treinamento_ia").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treinamento-ia"] });
      toast.success("Instrução removida!");
    },
  });

  const startEdit = (t: Treinamento) => {
    setForm({ titulo: t.titulo, instrucao: t.instrucao, categoria: t.categoria, canal: t.canal });
    setEditId(t.id);
    setAnexo(t.anexo_url ? { file: null as any, url: t.anexo_url, nome: t.anexo_nome || "arquivo", tipo: t.anexo_tipo || "", conteudo: t.anexo_conteudo_extraido || "" } : null);
    setShowForm(true);
  };

  const canalIcon = (canal: string) => {
    if (canal === "whatsapp") return <MessageSquare className="h-3 w-3" />;
    if (canal === "voz") return <Phone className="h-3 w-3" />;
    return <Globe className="h-3 w-3" />;
  };

  const fileIcon = (tipo: string) => {
    if (tipo?.startsWith("image/")) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const grouped = CATEGORIAS.map(cat => ({
    ...cat,
    items: treinamentos.filter(t => t.categoria === cat.value),
  })).filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Treinamento da Maria (IA)
            </h1>
            <p className="text-muted-foreground text-sm">
              Adicione instruções que a Maria aprende e aplica em todas as conversas.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setShowForm(true); setEditId(null); setForm({ titulo: "", instrucao: "", categoria: "geral", canal: "ambos" }); setAnexo(null); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Instrução
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chat">💬 Conversar</TabsTrigger>
            <TabsTrigger value="aprender">✨ Aprender com conversas</TabsTrigger>
            <TabsTrigger value="instrucoes">📋 Instruções</TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            <ChatTreinamento />
          </TabsContent>

          <TabsContent value="aprender">
            <AprenderConversas />
          </TabsContent>


          <TabsContent value="instrucoes" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">{treinamentos.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-green-500">{treinamentos.filter(t => t.ativo).length}</p>
                  <p className="text-xs text-muted-foreground">Ativas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{treinamentos.filter(t => !t.ativo).length}</p>
                  <p className="text-xs text-muted-foreground">Inativas</p>
                </CardContent>
              </Card>
            </div>

            {/* Form */}
            {showForm && isAdmin && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="text-lg">{editId ? "Editar" : "Nova"} Instrução</CardTitle>
                  <CardDescription>Escreva de forma clara o que a Maria deve aprender. Anexe arquivos para ela ler.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Canal</Label>
                      <Select value={form.canal} onValueChange={v => setForm(f => ({ ...f, canal: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CANAIS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input placeholder="Ex: Quando pedirem dentista, indicar Dra. Amélia" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Instrução (o que a Maria deve fazer)</Label>
                    <Textarea
                      placeholder="Ex: Quando o paciente pedir dentista, clínico geral ou odontologia, indique APENAS profissionais com especialidade odontológica."
                      value={form.instrucao}
                      onChange={e => setForm(f => ({ ...f, instrucao: e.target.value }))}
                      rows={5}
                    />
                  </div>

                  {/* File attachment */}
                  <div className="space-y-2">
                    <Label>Anexo (planilha, PDF ou imagem)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    
                    {!anexo ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed h-20 flex flex-col gap-1"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-xs">Processando arquivo...</span>
                          </>
                        ) : (
                          <>
                            <Paperclip className="h-5 w-5" />
                            <span className="text-xs">Clique para anexar PDF, planilha ou imagem</span>
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="border rounded-lg p-3 bg-muted/50">
                        <div className="flex items-center gap-2">
                          {fileIcon(anexo.tipo)}
                          <span className="text-sm font-medium flex-1 truncate">{anexo.nome}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setAnexo(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        {anexo.conteudo && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              Ver conteúdo extraído ({anexo.conteudo.length} caracteres)
                            </summary>
                            <pre className="mt-1 text-xs bg-background p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                              {anexo.conteudo}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => upsertMutation.mutate({ ...form, id: editId || undefined })} disabled={!form.titulo || !form.instrucao || uploading}>
                      <Save className="h-4 w-4 mr-1" /> {editId ? "Salvar" : "Adicionar"}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setAnexo(null); }}>
                      <X className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* List */}
            {isLoading ? (
              <p className="text-center text-muted-foreground">Carregando...</p>
            ) : grouped.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Nenhuma instrução cadastrada</p>
                  <p className="text-sm text-muted-foreground">Adicione instruções para treinar a Maria.</p>
                </CardContent>
              </Card>
            ) : (
              grouped.map(group => (
                <div key={group.value} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h3>
                  {group.items.map(t => (
                    <Card key={t.id} className={!t.ativo ? "opacity-50" : ""}>
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium">{t.titulo}</span>
                              <Badge variant="outline" className="text-xs flex items-center gap-1">
                                {canalIcon(t.canal)} {t.canal}
                              </Badge>
                              {t.anexo_nome && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  {fileIcon(t.anexo_tipo || "")} {t.anexo_nome}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.instrucao}</p>
                            {t.anexo_conteudo_extraido && (
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer">
                                  📎 Conteúdo do anexo ({t.anexo_conteudo_extraido.length} caracteres)
                                </summary>
                                <pre className="mt-1 text-xs bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
                                  {t.anexo_conteudo_extraido}
                                </pre>
                              </details>
                            )}
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Switch checked={t.ativo} onCheckedChange={ativo => toggleMutation.mutate({ id: t.id, ativo })} />
                              <Button size="icon" variant="ghost" onClick={() => startEdit(t)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
