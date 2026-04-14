import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import type { Lead } from "./LeadCard";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";

interface LeadEditDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  columns: PipelineColumn[];
}

export function LeadEditDialog({ lead, open, onOpenChange, onSaved, columns }: LeadEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: lead.nome || "",
    telefone: lead.telefone || "",
    email: lead.email || "",
    cpf: lead.cpf || "",
    data_nascimento: lead.data_nascimento || "",
    cep: lead.cep || "",
    logradouro: lead.logradouro || "",
    numero: lead.numero || "",
    bairro: lead.bairro || "",
    cidade: lead.cidade || "",
    estado: lead.estado || "",
    origem: lead.origem || "",
    observacoes: lead.observacoes || "",
    status_pipeline: lead.status_pipeline || "novo",
  });

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("leads")
      .update({
        nome: form.nome || null,
        telefone: form.telefone || null,
        email: form.email || null,
        cpf: form.cpf || null,
        data_nascimento: form.data_nascimento || null,
        cep: form.cep || null,
        logradouro: form.logradouro || null,
        numero: form.numero || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        origem: form.origem || null,
        observacoes: form.observacoes || null,
        status_pipeline: form.status_pipeline,
      })
      .eq("id", lead.id);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead atualizado com sucesso" });
      onSaved();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Lead — {lead.nome || "Sem nome"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 p-1">
            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status no Pipeline</Label>
              <Select value={form.status_pipeline} onValueChange={(v) => set("status_pipeline", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.chave} value={c.chave}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dados pessoais */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome Completo</Label>
                <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Nascimento</Label>
                <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} />
              </div>
            </div>

            {/* Endereço */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => set("cep", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Input value={form.estado} onChange={(e) => set("estado", e.target.value)} maxLength={2} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Logradouro</Label>
                <Input value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
              </div>
            </div>

            {/* Origem */}
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input value={form.origem} onChange={(e) => set("origem", e.target.value)} placeholder="Ex: vitta-care.com" />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Pedidos, desejos do cliente, anotações..."
                rows={4}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
