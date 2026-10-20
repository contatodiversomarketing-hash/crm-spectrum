import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LABEL_COLORS, useCrmEtiquetas, type LabelColor } from "@/hooks/useCrmEtiquetas";

export function EtiquetasPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const { catalog, refresh, error } = useCrmEtiquetas();
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("primary");
  const [saving, setSaving] = useState(false);
  const create = async () => {
    const nome = name.trim();
    if (!nome) return;
    const duplicate = catalog.find((item) => item.nome.toLocaleLowerCase() === nome.toLocaleLowerCase());
    if (duplicate) {
      onChange([...new Set([...value, duplicate.chave])]);
      setName("");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("crm_etiquetas").insert({ nome, cor: color }).select().single();
    setSaving(false);
    if (error) { toast({ title: "Não foi possível criar a etiqueta", description: error.message, variant: "destructive" }); return; }
    await refresh();
    onChange([...new Set([...value, data.id])]);
    setName("");
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5">
      {catalog.map((item) => <Button key={item.chave} type="button" variant="outline" size="sm" aria-pressed={value.includes(item.chave)} className={`h-auto whitespace-normal text-xs ${value.includes(item.chave) ? item.classe : ""}`} onClick={() => onChange(value.includes(item.chave) ? value.filter((key) => key !== item.chave) : [...value, item.chave])}>
        {value.includes(item.chave) && <Check className="h-3 w-3 mr-1 shrink-0" />}{item.nome}
      </Button>)}
    </div>
    {error && <p className="text-xs text-destructive">Não foi possível carregar as etiquetas personalizadas.</p>}
    <div className="space-y-2 border-t border-border pt-3">
      <Label htmlFor="nova-etiqueta">Nova etiqueta</Label>
      <Input id="nova-etiqueta" placeholder="Nome da etiqueta" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(Object.keys(LABEL_COLORS) as LabelColor[]).map((key, index) => <Button key={key} type="button" variant="outline" size="icon" title={["Sálvia", "Terracota", "Areia", "Neutra"][index]} aria-label={["Sálvia", "Terracota", "Areia", "Neutra"][index]} aria-pressed={color === key} className={`h-7 w-7 ${LABEL_COLORS[key]}`} onClick={() => setColor(key)}>{color === key && <Check className="h-3 w-3" />}</Button>)}
        </div>
        <Button type="button" size="sm" disabled={!name.trim() || saving} onClick={create}><Plus className="h-3.5 w-3.5 mr-1" />{saving ? "Criando..." : "Criar etiqueta"}</Button>
      </div>
    </div>
  </div>;
}