import { useState, useEffect } from "react";
import { Phone, MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function ChannelToggles() {
  const [whatsappAtivo, setWhatsappAtivo] = useState(true);
  const [telefoneAtivo, setTelefoneAtivo] = useState(true);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    const { data } = await supabase
      .from("configuracoes_sistema")
      .select("id, whatsapp_ativo, telefone_ativo")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setWhatsappAtivo(data.whatsapp_ativo);
      setTelefoneAtivo(data.telefone_ativo);
    }
    setLoading(false);
  }

  async function toggleChannel(channel: "whatsapp_ativo" | "telefone_ativo", value: boolean) {
    const setter = channel === "whatsapp_ativo" ? setWhatsappAtivo : setTelefoneAtivo;
    setter(value);

    const { data: config } = await supabase
      .from("configuracoes_sistema")
      .select("id")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config) {
      toast({ title: "Erro", description: "Configuração não encontrada", variant: "destructive" });
      setter(!value);
      return;
    }

    const { error } = await supabase
      .from("configuracoes_sistema")
      .update({ [channel]: value })
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro", description: "Falha ao salvar", variant: "destructive" });
      setter(!value);
      return;
    }

    const label = channel === "whatsapp_ativo" ? "WhatsApp" : "Telefone";
    toast({
      title: `${label} ${value ? "ativado" : "desativado"}`,
      description: value ? "Atendimento retomado" : "Atendimento pausado",
    });
  }

  if (loading) return null;

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <MessageSquare className={`h-4 w-4 ${whatsappAtivo ? "text-success" : "text-muted-foreground"}`} />
        <span className="text-xs hidden sm:inline">WhatsApp</span>
        <Switch
          checked={whatsappAtivo}
          onCheckedChange={(v) => toggleChannel("whatsapp_ativo", v)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Phone className={`h-4 w-4 ${telefoneAtivo ? "text-success" : "text-muted-foreground"}`} />
        <span className="text-xs hidden sm:inline">Telefone</span>
        <Switch
          checked={telefoneAtivo}
          onCheckedChange={(v) => toggleChannel("telefone_ativo", v)}
        />
      </div>
    </div>
  );
}
