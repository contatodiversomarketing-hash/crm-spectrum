import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Lead } from "./LeadCard";

interface Props {
  colunaNome: string;
  leads: Lead[];
}

export function EnvioEmMassaDialog({ colunaNome, leads }: Props) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, ok: 0, falhas: 0, templates: 0 });

  const comTelefone = leads.filter((l) => (l.telefone || "").replace(/\D/g, "").length >= 10);

  const enviar = async () => {
    if (!texto.trim() || comTelefone.length === 0) return;
    setEnviando(true);
    let ok = 0, falhas = 0, templates = 0;
    for (let i = 0; i < comTelefone.length; i++) {
      const lead = comTelefone[i];
      const primeiro = (lead.nome || "").trim().split(/\s+/)[0] || "";
      const msg = texto.replace(/\{nome\}/gi, /\d/.test(primeiro) ? "" : primeiro);
      try {
        const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
          body: { numero: lead.telefone, tipo: "text", texto: msg, leadId: lead.id },
        });
        if (error || data?.error) falhas++;
        else { ok++; if (data?.aviso) templates++; }
      } catch {
        falhas++;
      }
      setProgresso({ feitos: i + 1, ok, falhas, templates });
      if (i < comTelefone.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    setEnviando(false);
    toast({
      title: "Envio concluído",
      description: `${ok} enviadas, ${falhas} com falha${templates ? `. ${templates} estavam fora das 24h e receberam a mensagem de reabordagem aprovada.` : "."}`,
      variant: falhas && !ok ? "destructive" : undefined,
    });
    if (!falhas) { setOpen(false); setTexto(""); }
  };

  return (
    <>
      <button
        type="button"
        title="Enviar mensagem para todos desta coluna"
        onClick={() => { setProgresso({ feitos: 0, ok: 0, falhas: 0, templates: 0 }); setOpen(true); }}
        className="p-1 rounded hover:bg-background text-muted-foreground hover:text-primary"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={(o) => !enviando && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para todos — {colunaNome}</DialogTitle>
            <DialogDescription>
              Vai para {comTelefone.length} contato(s) com WhatsApp nesta coluna. Use {"{nome}"} para colocar o primeiro nome da pessoa.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={7}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Digite ou cole a mensagem..."
            disabled={enviando}
          />
          <p className="text-xs text-muted-foreground">
            Quem não conversou nas últimas 24h recebe primeiro a mensagem de reabordagem aprovada (regra do WhatsApp).
          </p>
          {progresso.feitos > 0 && (
            <p className="text-sm">
              {progresso.feitos}/{comTelefone.length} — {progresso.ok} enviadas, {progresso.falhas} falhas
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando || !texto.trim() || comTelefone.length === 0}>
              <Send className="h-4 w-4 mr-1.5" />
              {enviando ? "Enviando..." : `Enviar para ${comTelefone.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
