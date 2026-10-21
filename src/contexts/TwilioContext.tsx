import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Phone, Pause, Play } from "lucide-react";
import { prepareCallAudio } from "@/lib/callAudio";

export function normalizarTelefoneBR(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55") || d.length <= 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  return "+" + d;
}

type Estado = "idle" | "chamando" | "em_chamada" | "encerrada";
interface LigarParams { telefone: string; nome?: string | null; leadId?: string | null; pacienteId?: string | null }
interface Ctx { ligar: (p: LigarParams) => Promise<void>; estado: Estado }

const TwilioCtx = createContext<Ctx>({ ligar: async () => {}, estado: "idle" });
export const useTwilio = () => useContext(TwilioCtx);

async function buscarToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("twilio-generate-token");
  if (error || !data?.token) throw new Error(data?.error || error?.message || "Falha ao obter token");
  return data.token;
}

export function TwilioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const startingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [inicio, setInicio] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [mudo, setMudo] = useState(false);
  const [espera, setEspera] = useState(false);

  useEffect(() => {
    if (estado !== "em_chamada") return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [estado]);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    startingRef.current = false;
    callRef.current?.disconnect();
    callRef.current = null;
    deviceRef.current?.unregister().catch(() => {});
    deviceRef.current?.destroy();
    deviceRef.current = null;
  }, [user?.id]);

  const renovar = useCallback(async () => {
    const d = deviceRef.current;
    if (!d) return;
    try { d.updateToken(await buscarToken()); } catch (e) { console.warn("refresh token", e); }
  }, []);

  useEffect(() => {
    const t = setInterval(renovar, 55 * 60 * 1000);
    return () => clearInterval(t);
  }, [renovar]);

  const garantirDevice = useCallback(async () => {
    if (deviceRef.current && deviceRef.current.state === "registered") return deviceRef.current;
    deviceRef.current?.destroy();
    deviceRef.current = null;
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    s.getTracks().forEach((t) => t.stop());
    const token = await buscarToken();
    const d = new Device(token, { codecPreferences: [Call.Codec.PCMU, Call.Codec.Opus], closeProtection: true, edge: ["sao-paulo", "ashburn", "roaming"], logLevel: "warn" });
    d.on("tokenWillExpire", renovar);
    d.on("error", async (err: { code?: number; message?: string }) => {
      console.error("Twilio device", err);
      if (err.code === 20104 || err.code === 31205) { await renovar(); d.register().catch(() => {}); }
    });
    deviceRef.current = d;
    await d.register();
    return d;
  }, [renovar]);

  const finalizar = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    startingRef.current = false;
    setEstado("encerrada");
    callRef.current = null;
    deviceRef.current?.audio?.unsetInputDevice().catch((error) => console.warn("Microfone: liberação falhou", error));
    resetTimerRef.current = setTimeout(() => { setEstado("idle"); setInicio(null); setMudo(false); setEspera(false); resetTimerRef.current = null; }, 2500);
  }, []);

  const ligar = useCallback(async ({ telefone, nome, leadId, pacienteId }: LigarParams) => {
    const to = normalizarTelefoneBR(telefone);
    if (!to) { toast.error("Telefone inválido. Use DDD + número."); return; }
    if (startingRef.current || callRef.current) { toast.error("Já existe uma ligação em andamento."); return; }
    startingRef.current = true;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setInicio(null); setMudo(false); setEspera(false);
    setNome(nome || to); setNumero(to); setEstado("chamando");
    try {
      const d = await garantirDevice();
      if (!d.audio) throw new Error("Não foi possível preparar o áudio do computador.");
      await prepareCallAudio(d.audio);
      const call = await d.connect({ params: {
        To: to, agentUserId: user?.id ?? "", leadId: leadId ?? "", pacienteId: pacienteId ?? "", clientName: nome ?? "",
      } });
      callRef.current = call;
      startingRef.current = false;
      const finishThisCall = () => { if (callRef.current === call) finalizar(); };
      call.on("accept", () => { if (callRef.current === call) { setEstado("em_chamada"); setAgora(Date.now()); setInicio(Date.now()); } });
      call.on("disconnect", finishThisCall);
      call.on("cancel", finishThisCall);
      call.on("reject", finishThisCall);
      call.on("warning", (warning: string) => {
        console.warn("Twilio áudio", warning);
        if (["constant-audio-input-level", "constant-audio-output-level", "low-mos", "high-packet-loss"].includes(warning)) {
          toast.warning("O áudio da ligação está instável ou sem som. Confira o microfone, a saída de som e a internet.", { id: "call-audio-warning" });
        }
      });
      call.on("error", (e: { message?: string; code?: number }) => {
        const m = e.message ?? "";
        if (e.code === 31005 || m.includes("31005") || m.includes("HANGUP")) {
          toast.warning("A conexão da ligação foi interrompida. Não é possível confirmar se a pessoa atendeu; tente novamente.");
        } else {
          toast.error(`Erro na ligação: ${m}`);
        }
        call.disconnect();
        finishThisCall();
      });
    } catch (e) {
      const msg = (e as Error).message || "";
      toast.error(msg.includes("Permission") || msg.includes("NotAllowed") ? "Permita o uso do microfone para ligar." : `Não foi possível ligar: ${msg}`);
      finalizar();
    }
  }, [garantirDevice, finalizar, user?.id]);

  const encerrar = () => {
    const c = callRef.current;
    c?.disconnect();
    if (!c) finalizar();
  };
  const alternarMudo = () => { const c = callRef.current; if (!c) return; c.mute(!mudo); setMudo(!mudo); };
  const alternarEspera = () => {
    // Espera = silencia os dois lados localmente (sem música)
    const c = callRef.current; if (!c) return;
    const novo = !espera; c.mute(novo || mudo); setEspera(novo);
  };

  const seg = inicio ? Math.floor((agora - inicio) / 1000) : 0;
  const tempo = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;
  const rotulo = estado === "chamando" ? "Chamando…" : estado === "em_chamada" ? (espera ? "Em espera" : "Em chamada") : "Encerrada";

  return (
    <TwilioCtx.Provider value={{ ligar, estado }}>
      {children}
      {estado !== "idle" && (
        <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border bg-card p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"><Phone className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="truncate font-medium">{nome}</p>
              <p className="text-xs text-muted-foreground">{numero}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{rotulo}</span>
            <span className="font-mono">{tempo}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" disabled={estado !== "em_chamada"} onClick={alternarMudo}>
              {mudo ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}<span className="ml-1">Mudo</span>
            </Button>
            <Button variant="outline" size="sm" className="flex-1" disabled={estado !== "em_chamada"} onClick={alternarEspera}>
              {espera ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}<span className="ml-1">Espera</span>
            </Button>
            <Button variant="destructive" size="sm" className="flex-1" disabled={estado === "encerrada"} onClick={encerrar}>
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </TwilioCtx.Provider>
  );
}

export function BotaoLigar({ telefone, nome, leadId, pacienteId, className }: LigarParams & { className?: string }) {
  const { ligar, estado } = useTwilio();
  return (
    <Button type="button" variant="ghost" size="icon" className={className ?? "h-6 w-6"} title="Ligar"
      disabled={estado !== "idle" || !telefone} onClick={(e) => { e.stopPropagation(); ligar({ telefone, nome, leadId, pacienteId }); }}>
      <Phone className="h-3.5 w-3.5" />
    </Button>
  );
}
