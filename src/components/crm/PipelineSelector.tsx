import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import type { Pipeline } from "@/hooks/usePipelines";

interface Props {
  pipelines: Pipeline[];
  activePipelineId: string | null;
  onSelect: (id: string) => void;
  onAdd: (nome: string) => Promise<{ data: any; error: any }>;
  onUpdate: (id: string, nome: string) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
}

export function PipelineSelector({ pipelines, activePipelineId, onSelect, onAdd, onUpdate, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { data, error } = await onAdd(newName.trim());
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setNewName("");
      setAdding(false);
      if (data?.id) onSelect(data.id);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const err = await onUpdate(editingId, editName.trim());
    if (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } else {
      setEditingId(null);
    }
  };

  const handleDelete = async (p: Pipeline) => {
    if (!confirm(`Excluir pipeline "${p.nome}"? Leads vinculados perderão a referência.`)) return;
    const err = await onDelete(p.id);
    if (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pipelines.map((p) =>
        editingId === p.id ? (
          <div key={p.id} className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 w-36 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveEdit}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div key={p.id} className="flex items-center gap-0.5 group">
            <Button
              variant={activePipelineId === p.id ? "default" : "outline"}
              size="sm"
              className="h-8 text-sm"
              onClick={() => onSelect(p.id)}
            >
              {p.nome}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => { setEditingId(p.id); setEditName(p.nome); }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {pipelines.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                onClick={() => handleDelete(p)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      )}

      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do pipeline"
            className="h-8 w-40 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            autoFocus
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleAdd}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdding(false); setNewName(""); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-8 text-sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Pipeline
        </Button>
      )}
    </div>
  );
}
