import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Check, Trash2, Plus, Bell } from "lucide-react";

interface Alerta {
  id: string;
  titulo: string;
  descricao: string | null;
  lembrar_em: string;
  concluido: boolean;
}

export function LeadAlertsDialog({
  leadId,
  leadName,
  open,
  onOpenChange,
}: {
  leadId: string;
  leadName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [titulo, setTitulo] = useState("");
  const [lembrar, setLembrar] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchAlertas = async () => {
    const { data } = await supabase
      .from("lead_alertas")
      .select("*")
      .eq("lead_id", leadId)
      .order("lembrar_em", { ascending: true });
    setAlertas((data as Alerta[]) || []);
  };

  useEffect(() => {
    if (open) fetchAlertas();
  }, [open, leadId]);

  const add = async () => {
    if (!titulo || !lembrar) {
      toast({ title: "Preencha título e data", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("lead_alertas").insert([{
      lead_id: leadId,
      titulo,
      lembrar_em: new Date(lembrar).toISOString(),
    }]);
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setTitulo("");
    setLembrar("");
    fetchAlertas();
  };

  const toggle = async (a: Alerta) => {
    await supabase.from("lead_alertas").update({ concluido: !a.concluido }).eq("id", a.id);
    fetchAlertas();
  };

  const remove = async (id: string) => {
    await supabase.from("lead_alertas").delete().eq("id", id);
    fetchAlertas();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Lembretes — {leadName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2 border rounded-lg p-3">
            <Input placeholder="Ex: Ligar para confirmar consulta" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <Input type="datetime-local" value={lembrar} onChange={(e) => setLembrar(e.target.value)} />
            <Button size="sm" onClick={add} disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-1.5" /> Adicionar lembrete
            </Button>
          </div>

          <ul className="space-y-2 max-h-[300px] overflow-y-auto">
            {alertas.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-4">Nenhum lembrete ainda</li>
            )}
            {alertas.map((a) => {
              const atrasado = !a.concluido && new Date(a.lembrar_em) < new Date();
              return (
                <li
                  key={a.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded border text-sm ${
                    a.concluido ? "opacity-50 line-through" : atrasado ? "border-destructive/50 bg-destructive/5" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.lembrar_em).toLocaleString("pt-BR")}
                      {atrasado && " ⚠️ atrasado"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(a)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
