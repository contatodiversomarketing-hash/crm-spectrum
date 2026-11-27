import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineColumns } from "@/hooks/usePipelineColumns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Link2, Copy, ExternalLink, Plus, Pencil, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Oferta = Tables<"captacao_ofertas">;
type Inscricao = Tables<"captacao_inscricoes">;
const empty = { titulo: "", slug: "", descricao: "", pipeline_id: "", coluna_chave: "", whatsapp: "553298034423" };
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const link = (slug: string) => `https://crm-spectrum.lovable.app/cadastro/${slug}`;

export function CaptacaoDialog() {
  const { hasRole, hasAnyRole } = useAuth();
  const { pipelines } = usePipelines();
  const [open, setOpen] = useState(false);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { columns } = usePipelineColumns(form.pipeline_id || null);
  async function load() {
    setLoading(true);
    const [offers, submissions] = await Promise.all([
      supabase.from("captacao_ofertas").select("*").order("created_at", { ascending: false }),
      supabase.from("captacao_inscricoes").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(page * 30, page * 30 + 29),
    ]);
    if (offers.error || submissions.error) toast.error("Não foi possível carregar os cadastros.");
    else { setOfertas(offers.data || []); setInscricoes(submissions.data || []); setTotal(submissions.count || 0); }
    setLoading(false);
  }
  useEffect(() => { if (open) void load(); }, [open, page]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const digits = form.whatsapp.replace(/\D/g, "");
    const phone = digits.length <= 11 ? `55${digits}` : digits;
    if (!/^55[1-9]{2}\d{8,9}$/.test(phone)) { toast.error("Informe o WhatsApp de destino com DDD."); return; }
    if (!columns.some(c => c.chave === form.coluna_chave)) { toast.error("Escolha a coluna de entrada."); return; }
    setSaving(true);
    const payload = { ...form, titulo: form.titulo.trim(), slug: slugify(form.slug), whatsapp: phone };
    const result = editing && editing !== "new" ? await supabase.from("captacao_ofertas").update(payload).eq("id", editing) : await supabase.from("captacao_ofertas").insert(payload);
    setSaving(false);
    if (result.error) { toast.error(result.error.code === "23505" ? "Este endereço já está em uso. Escolha outro." : "Não foi possível salvar o link."); return; }
    setEditing(null); setForm(empty); await load(); toast.success("Link de cadastro salvo.");
  }
  async function toggle(o: Oferta, ativo: boolean) {
    const { error } = await supabase.from("captacao_ofertas").update({ ativo }).eq("id", o.id);
    if (error) toast.error("Não foi possível alterar o link."); else await load();
  }
  if (!hasAnyRole("admin", "supervisao")) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Link2 className="mr-1.5 h-4 w-4" />Links de anúncios</Button></DialogTrigger>
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="font-display text-3xl">Cadastros dos anúncios</DialogTitle></DialogHeader>
      {editing ? <form onSubmit={save} className="space-y-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <div className="space-y-2"><Label htmlFor="oferta-titulo">Nome da oferta</Label><Input id="oferta-titulo" required minLength={2} maxLength={120} placeholder="Consulta, NeuroAcesso, Endocannabis Academy..." value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value, slug: editing === "new" ? slugify(e.target.value) : form.slug })} /></div>
        <div className="space-y-2"><Label htmlFor="oferta-slug">Endereço do cadastro</Label><Input id="oferta-slug" required maxLength={100} value={form.slug} onChange={e => setForm({ ...form, slug: slugify(e.target.value) })} /><p className="text-xs text-muted-foreground break-all">{link(form.slug || "sua-oferta")}</p></div>
        <div className="space-y-2"><Label htmlFor="oferta-descricao">Texto de apresentação (opcional)</Label><Textarea id="oferta-descricao" maxLength={2000} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>CRM de destino</Label><Select value={form.pipeline_id} onValueChange={value => setForm({ ...form, pipeline_id: value, coluna_chave: "" })}><SelectTrigger aria-label="CRM de destino"><SelectValue placeholder="Escolha o funil" /></SelectTrigger><SelectContent>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Coluna de entrada</Label><Select value={form.coluna_chave} onValueChange={value => setForm({ ...form, coluna_chave: value })}><SelectTrigger aria-label="Coluna de entrada"><SelectValue placeholder="Escolha a coluna" /></SelectTrigger><SelectContent>{columns.map(c => <SelectItem key={c.id} value={c.chave}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label htmlFor="oferta-whatsapp">WhatsApp que receberá o contato</Label><Input id="oferta-whatsapp" type="tel" required placeholder="(DDD) número da equipe" maxLength={30} value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} /></div>
        <Button type="submit" disabled={saving} className="w-full">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar link</Button>
      </form> : <Tabs defaultValue="links">
        <TabsList><TabsTrigger value="links">Links</TabsTrigger><TabsTrigger value="inscricoes">Cadastros ({total})</TabsTrigger></TabsList>
        <TabsContent value="links" className="space-y-4">
          {hasRole("admin") && <Button size="sm" onClick={() => { setEditing("new"); setForm(empty); }}><Plus className="mr-2 h-4 w-4" />Criar link</Button>}
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && !ofertas.length && <p className="py-6 text-muted-foreground">Nenhum link cadastrado.</p>}
          {ofertas.map(o => <div key={o.id} className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-sans text-base font-semibold break-words">{o.titulo}</h3><p className="text-xs text-muted-foreground">{pipelines.find(p => p.id === o.pipeline_id)?.nome} · {o.coluna_chave}</p></div>{hasRole("admin") && <Switch aria-label={`Ativar ${o.titulo}`} checked={o.ativo} onCheckedChange={v => void toggle(o, v)} />}</div>
            <p className="text-sm text-muted-foreground break-all">{link(o.slug)}</p>
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(link(o.slug)); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar o link."); } }}><Copy className="mr-2 h-4 w-4" />Copiar link</Button><Button variant="outline" size="sm" asChild><a href={`/cadastro/${o.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir</a></Button>{hasRole("admin") && <Button variant="ghost" size="sm" onClick={() => { setEditing(o.id); setForm({ titulo: o.titulo, slug: o.slug, descricao: o.descricao, pipeline_id: o.pipeline_id, coluna_chave: o.coluna_chave, whatsapp: o.whatsapp }); }}><Pencil className="mr-2 h-4 w-4" />Editar</Button>}</div>
          </div>)}
        </TabsContent>
        <TabsContent value="inscricoes" className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Atualizar cadastros</Button>
          {!loading && !inscricoes.length && <p className="py-6 text-muted-foreground">Nenhum cadastro recebido.</p>}
          {inscricoes.map(i => <div key={i.id} className="border-b border-border py-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{i.nome}</strong><time className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time></div><p className="text-sm">{i.telefone}</p><p className="text-xs text-muted-foreground">{ofertas.find(o => o.id === i.oferta_id)?.titulo} · {typeof i.origem === "object" && i.origem && "utm_campaign" in i.origem ? String(i.origem.utm_campaign || "Sem campanha informada") : "Sem campanha informada"}</p></div>)}
          {total > 30 && <div className="flex items-center justify-between"><Button variant="outline" size="sm" disabled={!page || loading} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">{page + 1} / {Math.ceil(total / 30)}</span><Button variant="outline" size="sm" disabled={(page + 1) * 30 >= total || loading} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
        </TabsContent>
      </Tabs>}
    </DialogContent>
  </Dialog>;
}