import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, CheckCircle2, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo-amelia.png";

type Oferta = { titulo: string; descricao: string; slug: string };
export default function CadastroOferta() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const request = useRef(crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setOferta(null); setWhatsapp(""); request.current = crypto.randomUUID();
    supabase.functions.invoke("captacao-publica", { body: { action: "offer", slug } }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.oferta) setError("Este cadastro não está disponível no momento.");
      else { setOferta(data.oferta); document.title = `${data.oferta.titulo} | Dra. Amélia Carvalho`; }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const origem: Record<string, string> = {};
      for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
        const value = params.get(key); if (value) origem[key] = value.slice(0, key === "fbclid" ? 500 : 200);
      }
      const { data, error } = await supabase.functions.invoke("captacao-publica", { body: { action: "submit", slug, nome, telefone, consentimento, request_id: request.current, origem } });
      if (error) {
        let message = "Não foi possível salvar. Tente novamente.";
        if (error instanceof FunctionsHttpError) {
          try { message = (await error.context.json()).error || message; } catch { /* keep actionable fallback */ }
        }
        throw new Error(message);
      }
      if (!data?.whatsapp_url || !/^https:\/\/wa\.me\/55\d{10,11}\?text=/.test(data.whatsapp_url)) throw new Error("Não foi possível abrir o WhatsApp.");
      setWhatsapp(data.whatsapp_url);
      window.location.assign(data.whatsapp_url);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar seu cadastro."); }
    finally { setSaving(false); }
  }
  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border"><div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5"><img src={logo} alt="Símbolo da Dra. Amélia Carvalho" className="h-12 w-12 object-contain" /><span className="font-display text-2xl">Dra. Amélia Carvalho</span></div></header>
    <div className="mx-auto max-w-xl px-6 py-10 sm:py-14">
      {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div> : !oferta ? <p role="alert" className="text-destructive">{error}</p> : whatsapp ? <div className="space-y-6"><CheckCircle2 className="h-12 w-12 text-primary" /><h1 className="font-display text-4xl">Cadastro recebido</h1><p className="text-muted-foreground">{nome}, seus dados já estão com nossa equipe.</p><Button asChild className="w-full"><a href={whatsapp}><MessageCircle className="mr-2 h-4 w-4" />Continuar no WhatsApp</a></Button></div> : <>
        <p className="mb-3 text-sm font-medium uppercase text-accent">Vamos conversar</p>
        <h1 className="font-display text-4xl sm:text-5xl break-words">{oferta.titulo}</h1>
        {oferta.descricao && <p className="mt-4 whitespace-pre-line text-muted-foreground leading-relaxed">{oferta.descricao}</p>}
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2"><Label htmlFor="nome">Nome completo</Label><Input id="nome" autoComplete="name" value={nome} onChange={e => setNome(e.target.value)} required minLength={3} maxLength={120} className="h-12" /></div>
          <div className="space-y-2"><Label htmlFor="telefone">WhatsApp com DDD</Label><Input id="telefone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(11) 99999-9999" value={telefone} onChange={e => setTelefone(e.target.value)} required maxLength={30} className="h-12" /></div>
          <div className="flex items-start gap-3"><Checkbox id="consentimento" checked={consentimento} onCheckedChange={v => setConsentimento(v === true)} className="mt-1" /><Label htmlFor="consentimento" className="text-sm font-normal leading-relaxed">Autorizo a equipe da Dra. Amélia Carvalho a usar meu nome e telefone para entrar em contato pelo WhatsApp sobre esta oferta.</Label></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!consentimento || saving} className="h-12 w-full">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}{saving ? "Salvando cadastro..." : "Continuar no WhatsApp"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" /><span>Seus dados ficam restritos à nossa equipe.</span></div>
        </form>
      </>}
    </div>
    <footer className="mx-auto max-w-xl border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">Cuidado que entende. Tratamento que transforma.</footer>
  </main>;
}