import { useEffect, useRef, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { meetingLabel } from "@/lib/crmMeeting";

interface Due { id: string; titulo: string; lembrar_em: string; lead_id: string; leads: { nome: string | null; telefone: string | null } | null }

export function FollowUpAlerts() {
  const [due, setDue] = useState<Due[]>([]);
  const notified = useRef(new Set<string>());

  const load = async () => {
    const { data } = await supabase.from("lead_alertas").select("id, titulo, lembrar_em, lead_id, leads(nome, telefone)")
      .eq("concluido", false).lte("lembrar_em", new Date().toISOString()).order("lembrar_em").limit(50);
    const list = (data as unknown as Due[]) || [];
    setDue(list);
    list.forEach((a) => {
      if (notified.current.has(a.id)) return;
      notified.current.add(a.id);
      toast({ title: "Hora de conversar novamente", description: `${a.leads?.nome || a.leads?.telefone || "Lead"} — ${a.titulo}` });
    });
  };

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const concluir = async (id: string) => {
    await supabase.from("lead_alertas").update({ concluido: true }).eq("id", id);
    setDue((d) => d.filter((a) => a.id !== id));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={due.length ? "default" : "ghost"} size="sm" className="gap-1.5" title="Lembretes de contato">
          <BellRing className="h-4 w-4" />{due.length > 0 && <span className="text-xs font-bold">{due.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-semibold mb-2">Contatos para retomar</p>
        {due.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum lembrete vencido.</p> : (
          <ul className="space-y-2 max-h-80 overflow-auto">
            {due.map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium text-foreground truncate">{a.leads?.nome || a.leads?.telefone || "Lead"}</p>
                  <p className="text-muted-foreground">{a.titulo}</p>
                  <p className="text-muted-foreground">{meetingLabel(a.lembrar_em)}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Marcar como feito" onClick={() => concluir(a.id)}><Check className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
