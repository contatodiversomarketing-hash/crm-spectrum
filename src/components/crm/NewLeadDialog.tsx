import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Plus, Upload, X, FileText, BellPlus } from "lucide-react";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";

interface Props {
  pipelineId: string | null;
  columns: PipelineColumn[];
  onCreated: () => void;
}

interface DocMeta {
  path: string;
  name: string;
  size: number;
}

export function NewLeadDialog({ pipelineId, columns, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    nome_filho: "",
    observacoes: "",
    status_pipeline: columns[0]?.chave || "novo",
  });
  const [alerta, setAlerta] = useState({ titulo: "", lembrar_em: "" });
  const [docs, setDocs] = useState<DocMeta[]>([]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const reset = () => {
    setForm({ nome: "", telefone: "", email: "", nome_filho: "", observacoes: "", status_pipeline: columns[0]?.chave || "novo" });
    setAlerta({ titulo: "", lembrar_em: "" });
    setDocs([]);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: DocMeta[] = [];
    for (const file of Array.from(files)) {
      const path = `tmp/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("lead-documentos").upload(path, file, { upsert: false });
      if (error) {
        toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
        continue;
      }
      uploaded.push({ path, name: file.name, size: file.size });
    }
    setDocs((p) => [...p, ...uploaded]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeDoc = async (path: string) => {
    await supabase.storage.from("lead-documentos").remove([path]);
    setDocs((p) => p.filter((d) => d.path !== path));
  };

  const handleSave = async () => {
    if (!form.nome && !form.telefone) {
      toast({ title: "Informe ao menos nome ou telefone", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: lead, error } = await supabase
      .from("leads")
      .insert([{
        nome: form.nome || null,
        telefone: form.telefone || null,
        email: form.email || null,
        nome_filho: form.nome_filho || null,
        observacoes: form.observacoes || null,
        status_pipeline: form.status_pipeline,
        pipeline_id: pipelineId,
        origem: "manual",
        status: "novo",
        documentos: docs as any,
        ultima_interacao: new Date().toISOString(),
      }])
      .select("id")
      .single();

    if (error || !lead) {
      setSaving(false);
      toast({ title: "Erro ao criar lead", description: error?.message, variant: "destructive" });
      return;
    }

    if (alerta.titulo && alerta.lembrar_em) {
      await supabase.from("lead_alertas").insert({
        lead_id: lead.id,
        titulo: alerta.titulo,
        lembrar_em: new Date(alerta.lembrar_em).toISOString(),
      });
    }

    setSaving(false);
    toast({ title: "Lead adicionado com sucesso" });
    reset();
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Lead</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 p-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome Completo *</Label>
                <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Maria Silva" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone *</Label>
                <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="5532988217243" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do Filho (se tiver)</Label>
                <Input value={form.nome_filho} onChange={(e) => set("nome_filho", e.target.value)} placeholder="Ex: João, 8 anos" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Coluna do Pipeline</Label>
                <Select value={form.status_pipeline} onValueChange={(v) => set("status_pipeline", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.chave} value={c.chave}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Documentos */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Documentos anexados</Label>
              <input
                ref={fileRef}
                type="file"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-1.5" />
                {uploading ? "Enviando..." : "Anexar arquivos"}
              </Button>
              {docs.length > 0 && (
                <ul className="space-y-1">
                  {docs.map((d) => (
                    <li key={d.path} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                      <span className="truncate">{d.name}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeDoc(d.path)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Alerta inicial */}
            <div className="space-y-2 border-t pt-3">
              <Label className="flex items-center gap-1.5"><BellPlus className="h-3.5 w-3.5" /> Criar lembrete (opcional)</Label>
              <Input
                value={alerta.titulo}
                onChange={(e) => setAlerta((p) => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex: Ligar para confirmar consulta"
              />
              <Input
                type="datetime-local"
                value={alerta.lembrar_em}
                onChange={(e) => setAlerta((p) => ({ ...p, lembrar_em: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} />
            </div>

            <Button onClick={handleSave} disabled={saving || uploading} className="w-full">
              {saving ? "Salvando..." : "Adicionar Lead"}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
