import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import type { PipelineColumn } from "@/hooks/usePipelineColumns";
import { COLOR_OPTIONS } from "@/hooks/usePipelineColumns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: PipelineColumn[];
  onAdd: (nome: string, cor: string) => Promise<any>;
  onUpdate: (id: string, updates: { nome?: string; cor?: string }) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onReorder?: (ordered: PipelineColumn[]) => Promise<any>;
}

export function ColumnSettingsDialog({ open, onOpenChange, columns, onAdd, onUpdate, onDelete, onReorder }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDrop = async (targetId: string) => {
    const from = columns.findIndex((c) => c.id === dragId);
    const to = columns.findIndex((c) => c.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to || !onReorder) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const err = await onReorder(next);
    if (err) toast({ title: "Erro ao reordenar", description: err.message, variant: "destructive" });
  };

  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("bg-blue-500");
  const [adding, setAdding] = useState(false);

  const startEdit = (col: PipelineColumn) => {
    setEditingId(col.id);
    setEditName(col.nome);
    setEditColor(col.cor);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const err = await onUpdate(editingId, { nome: editName.trim(), cor: editColor });
    if (err) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } else {
      setEditingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const err = await onAdd(newName.trim(), newColor);
    setAdding(false);
    if (err) {
      toast({ title: "Erro ao criar coluna", description: err.message, variant: "destructive" });
    } else {
      setNewName("");
      setNewColor("bg-blue-500");
    }
  };

  const handleDelete = async (col: PipelineColumn) => {
    if (!confirm(`Excluir a coluna "${col.nome}"? Leads nessa coluna não serão excluídos.`)) return;
    const err = await onDelete(col.id);
    if (err) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Colunas do Pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {columns.map((col) => (
            <div
              key={col.id}
              draggable={dragId === col.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(col.id);
              }}
              onDragLeave={() => setOverId((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={`flex items-center gap-2 p-2 rounded-lg border bg-muted/30 transition-colors ${
                overId === col.id && dragId !== col.id ? "border-primary bg-primary/5" : "border-border"
              } ${dragId === col.id ? "opacity-50" : ""}`}
            >
              <GripVertical
                onMouseDown={() => setDragId(col.id)}
                onTouchStart={() => setDragId(col.id)}
                className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing"
              />
              {editingId === col.id ? (
                <div className="flex-1 space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nome da coluna"
                    className="h-8 text-sm"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className={`w-5 h-5 rounded-full ${c} ${editColor === c ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="default" onClick={saveEdit} className="h-7 text-xs">Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-xs">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`w-3 h-3 rounded-full ${col.cor} shrink-0`} />
                  <span className="flex-1 text-sm font-medium truncate">{col.nome}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(col)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(col)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="border-t border-border pt-3 space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Adicionar nova coluna</Label>
          <div className="flex gap-2 items-center">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da coluna"
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newName.trim()} className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" /> Criar
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full ${c} ${newColor === c ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
