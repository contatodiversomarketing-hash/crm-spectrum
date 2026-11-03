import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Lead } from "./LeadCard";
import { Checkbox } from "@/components/ui/checkbox";
import { BLACK_FRIDAY_NAME, BLACK_FRIDAY_TEXT, campaignCanSend, isCampaignExcludedColumn } from "../../../supabase/functions/_shared/black-friday-neuroacesso";

interface Props {
  colunaNome: string;
  leads: Lead[];
}

export function EnvioEmMassaDialog({ colunaNome, leads }: Props) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [blackFriday, setBlackFriday] = useState(false);
  const [status, setStatus] = useState("UNKNOWN");
  const [consent, setConsent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ignorados, setIgnorados] = useState(0);
  const [progresso, setProgresso] = useState({ feitos: 0, ok: 0, falhas: 0, templates: 0 });

  const comTelefone = leads.filter((l) => (l.telefone || "").replace(/\D/g, "").length >= 10 && (!blackFriday || (!isCampaignExcludedColumn(colunaNome) && !isCampaignExcludedColumn(l.status_pipeline))));

  const verificar = async (criar = false) => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerenciar-templates", {
        body: { acao: criar ? "criar_black_friday" : "consultar_black_friday" },
      });
      if (error || data?.error) {
        setStatus(criar ? "NOT_CREATED" : "UNKNOWN");
        const details = error && "context" in error && error.context instanceof Response ? await error.context.json().catch(() => null) : null;
        toast({ title: details?.error || data?.error || "Não foi possível verificar a campanha", variant: "destructive" });
      } else {
        setStatus(data.status);
        if (criar) toast({ title: "Campanha enviada para avaliação da Meta" });
      }
    } finally { setChecking(false); }
  };

  const enviar = async () => {
    if (!texto.trim() || comTelefone.length === 0) return;
    if (blackFriday && !campaignCanSend(status, consent)) return;
    setEnviando(true);
    setIgnorados(0);
    let skipped = 0;
    let ok = 0, falhas = 0, templates = 0;
    for (let i = 0; i < comTelefone.length; i++) {
      const lead = comTelefone[i];
      const primeiro = (lead.nome || "").trim().split(/\s+/)[0] || "";
      const msg = texto.replace(/\{nome\}/gi, /\d/.test(primeiro) ? "" : primeiro);
      try {
        const { data, error } = await supabase.functions.invoke("crm-enviar-whatsapp", {
          body: { numero: lead.telefone, tipo: "text", texto: msg, leadId: lead.id,
            ...(blackFriday ? { campanha: BLACK_FRIDAY_NAME, consentimentoConfirmado: consent } : {}),
          },
        });
        if (error || data?.error) {
          falhas++;
          if (blackFriday) {
            setProgresso({ feitos: i + 1, ok, falhas, templates });
            toast({ title: "Campanha interrompida após falha", description: "Verifique a aprovação e a situação do WhatsApp antes de continuar.", variant: "destructive" });
            break;
          }
        }
        else if (data?.skipped) { skipped++; setIgnorados(skipped); }
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
      description: `${ok} enviadas, ${falhas} com falha, ${skipped} ignoradas${templates ? `. ${templates} estavam fora das 24h e receberam a mensagem de reabordagem aprovada.` : "."}`,
      variant: falhas && !ok ? "destructive" : undefined,
    });
    if (!falhas) { setOpen(false); setTexto(""); }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        title="Enviar mensagem para todos desta coluna"
        onClick={() => { setProgresso({ feitos: 0, ok: 0, falhas: 0, templates: 0 }); setOpen(true); }}
        className="p-1 rounded hover:bg-background text-muted-foreground hover:text-primary"
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={(o) => !enviando && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para todos — {colunaNome}</DialogTitle>
            <DialogDescription>
              Vai para {comTelefone.length} contato(s) com WhatsApp nesta coluna.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant={!blackFriday ? "default" : "outline"} disabled={enviando} onClick={() => { setBlackFriday(false); setTexto(""); }}>Mensagem livre</Button>
            <Button variant={blackFriday ? "default" : "outline"} disabled={enviando} onClick={() => { setBlackFriday(true); setTexto(BLACK_FRIDAY_TEXT); setConsent(false); void verificar(); }}>Black Friday NeuroAcesso</Button>
          </div>
          <Textarea
            rows={7}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Digite ou cole a mensagem..."
            disabled={enviando}
            readOnly={blackFriday}
            aria-label="Mensagem do disparo"
          />
          {blackFriday ? <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Compra concluída e Aguardando resposta não recebem esta campanha; os cards permanecem onde estão.</p>
            <p className="text-sm">Meta: {({ APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Recusado", NOT_CREATED: "Ainda não solicitado", TEXT_MISMATCH: "Texto diferente do padrão", UNKNOWN: "Não verificado", PAUSED: "Pausado", DISABLED: "Desativado" } as Record<string, string>)[status] || status}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={checking || enviando} onClick={() => void verificar()}>Verificar aprovação</Button>
              {status === "NOT_CREATED" && <Button variant="outline" disabled={checking || enviando} onClick={() => void verificar(true)}>Solicitar aprovação na Meta</Button>}
            </div>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} disabled={enviando} onCheckedChange={(v) => setConsent(v === true)} />Confirmo que todos os destinatários autorizaram receber campanhas da clínica pelo WhatsApp.</label>
            <p className="text-xs text-muted-foreground">Participar de um grupo não significa autorizar publicidade. Aprovação não garante entrega nem impede bloqueios; mensagens de marketing podem ter cobrança da Meta.</p>
          </div> : <p className="text-xs text-muted-foreground">
            Quem não conversou nas últimas 24h recebe primeiro a mensagem de reabordagem aprovada (regra do WhatsApp).
          </p>}
          {progresso.feitos > 0 && (
            <p className="text-sm">
              {progresso.feitos}/{comTelefone.length} — {progresso.ok} enviadas, {progresso.falhas} falhas, {ignorados} ignoradas
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando || !texto.trim() || comTelefone.length === 0 || (blackFriday && !campaignCanSend(status, consent))}>
              <Send className="h-4 w-4 mr-1.5" />
              {enviando ? "Enviando..." : `Enviar para ${comTelefone.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
