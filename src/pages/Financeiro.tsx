import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Lancamento {
  id: string;
  paciente_id: string;
  descricao: string;
  valor: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  valor_parcela: number | null;
  pago: boolean;
  vencimento: string | null;
  data_pagamento: string | null;
  observacoes: string | null;
  criado_em: string;
}

interface PacienteMin { id: string; nome: string | null; telefone: string | null }

const FORMAS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Boleto", "Transferência"];
const PARCELAVEIS = ["Cartão de crédito", "Boleto"];
const PRODUTOS = [
  "Consulta inicial",
  "SPECTRA ADULTO — Plano 1 (Investigação)",
  "SPECTRA ADULTO — Plano 2 (Investigação + Acompanhamento)",
  "SPECTRA KIDS — Investigação",
  "SPECTRA KIDS — Acompanhamento",
  "Upgrade NEsplora",
  "Outro",
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Financeiro() {
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [pacientes, setPacientes] = useState<PacienteMin[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroForma, setFiltroForma] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // formulário
  const [pacienteId, setPacienteId] = useState("");
  const [descricao, setDescricao] = useState(PRODUTOS[0]);
  const [descricaoLivre, setDescricaoLivre] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState(FORMAS[0]);
  const [parcelas, setParcelas] = useState("1");
  const [pago, setPago] = useState("false");
  const [vencimento, setVencimento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const [lanc, pac] = await Promise.all([
      supabase.from("financeiro_lancamentos")
        .select("id, paciente_id, descricao, valor, forma_pagamento, parcelas, valor_parcela, pago, vencimento, data_pagamento, observacoes, criado_em")
        .order("criado_em", { ascending: false }),
      supabase.from("pacientes").select("id, nome, telefone").order("nome"),
    ]);
    setLoading(false);
    if (lanc.error) { toast.error("Erro ao carregar o financeiro"); return; }
    setItens((lanc.data ?? []) as unknown as Lancamento[]);
    setPacientes((pac.data ?? []) as PacienteMin[]);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const nomePaciente = useCallback((id: string) => {
    const p = pacientes.find((x) => x.id === id);
    return p?.nome || p?.telefone || "Paciente";
  }, [pacientes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (filtroForma !== "todas" && i.forma_pagamento !== filtroForma) return false;
      if (filtroStatus === "pago" && !i.pago) return false;
      if (filtroStatus === "aberto" && i.pago) return false;
      if (!q) return true;
      return [nomePaciente(i.paciente_id), i.descricao, i.forma_pagamento ?? ""]
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [itens, busca, filtroForma, filtroStatus, nomePaciente]);

  const total = filtrados.reduce((s, i) => s + Number(i.valor), 0);
  const recebido = filtrados.filter((i) => i.pago).reduce((s, i) => s + Number(i.valor), 0);

  const porForma = useMemo(() => {
    const m = new Map<string, { qtd: number; total: number }>();
    filtrados.forEach((i) => {
      const k = i.forma_pagamento || "Não informado";
      const a = m.get(k) ?? { qtd: 0, total: 0 };
      m.set(k, { qtd: a.qtd + 1, total: a.total + Number(i.valor) });
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [filtrados]);

  const porProduto = useMemo(() => {
    const m = new Map<string, { qtd: number; total: number }>();
    filtrados.forEach((i) => {
      const a = m.get(i.descricao) ?? { qtd: 0, total: 0 };
      m.set(i.descricao, { qtd: a.qtd + 1, total: a.total + Number(i.valor) });
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [filtrados]);

  const podeParcelar = PARCELAVEIS.includes(forma);
  const valorNum = Number(String(valor).replace(",", ".")) || 0;
  const nParcelas = podeParcelar ? Math.max(1, Number(parcelas) || 1) : 1;
  const parcelaCalc = valorNum > 0 ? valorNum / nParcelas : 0;

  const salvar = async () => {
    if (!pacienteId) { toast.error("Escolha o paciente"); return; }
    const desc = descricao === "Outro" ? descricaoLivre.trim() : descricao;
    if (!desc) { toast.error("Informe o que foi vendido"); return; }
    if (!valorNum || valorNum <= 0) { toast.error("Informe um valor válido"); return; }
    const estaPago = pago === "true";
    const { error } = await supabase.from("financeiro_lancamentos").insert({
      paciente_id: pacienteId,
      descricao: desc,
      valor: valorNum,
      forma_pagamento: forma,
      parcelas: nParcelas,
      valor_parcela: Number(parcelaCalc.toFixed(2)),
      pago: estaPago,
      vencimento: vencimento || null,
      data_pagamento: estaPago ? new Date().toISOString().slice(0, 10) : null,
      observacoes: observacoes.trim() || null,
    });
    if (error) { toast.error("Erro ao lançar: " + error.message); return; }
    toast.success("Venda registrada");
    setValor(""); setVencimento(""); setObservacoes(""); setDescricaoLivre(""); setParcelas("1");
    setOpen(false);
    carregar();
  };

  const alternarPago = async (l: Lancamento) => {
    const novo = !l.pago;
    const { error } = await supabase.from("financeiro_lancamentos")
      .update({ pago: novo, data_pagamento: novo ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", l.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    carregar();
  };

  const excluir = async (id: string) => {
    await supabase.from("financeiro_lancamentos").delete().eq("id", id);
    carregar();
  };

  return (
    <div className="bg-background min-h-full">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b bg-card/50">
        <div>
          <h1 className="text-2xl font-display">Financeiro</h1>
          <p className="text-xs text-muted-foreground">Vendas por paciente, forma de pagamento e parcelas</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por paciente ou item..." className="pl-9 w-64" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Nova venda</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg bg-background">
              <DialogHeader><DialogTitle>Registrar venda</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Paciente</Label>
                  <Select value={pacienteId} onValueChange={setPacienteId}>
                    <SelectTrigger><SelectValue placeholder="Escolha o paciente" /></SelectTrigger>
                    <SelectContent className="bg-popover z-50 max-h-72">
                      {pacientes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome || p.telefone || "Sem nome"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>O que foi vendido</Label>
                  <Select value={descricao} onValueChange={setDescricao}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {PRODUTOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {descricao === "Outro" && (
                    <Input className="mt-2" value={descricaoLivre} onChange={(e) => setDescricaoLivre(e.target.value)}
                      placeholder="Descreva o item" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Valor total (R$)</Label>
                    <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="500,00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Forma de pagamento</Label>
                    <Select value={forma} onValueChange={setForma}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {podeParcelar && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Quantas vezes</Label>
                      <Select value={parcelas} onValueChange={setParcelas}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover z-50 max-h-64">
                          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                            <SelectItem key={n} value={n}>{n}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor da parcela</Label>
                      <div className="h-10 flex items-center rounded-md border bg-muted/40 px-3 text-sm">
                        {brl(parcelaCalc)}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Situação</Label>
                    <Select value={pago} onValueChange={setPago}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="false">Pendente</SelectItem>
                        <SelectItem value="true">Pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vencimento</Label>
                    <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex.: sinal de 30% pago no Pix" />
                </div>
                <Button onClick={salvar} className="w-full">Registrar venda</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] text-muted-foreground">Total vendido</p>
            <p className="text-xl font-semibold">{brl(total)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] text-muted-foreground">Recebido</p>
            <p className="text-xl font-semibold text-success">{brl(recebido)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] text-muted-foreground">Em aberto</p>
            <p className="text-xl font-semibold text-accent">{brl(total - recebido)}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium mb-2">Por forma de pagamento</p>
            {porForma.length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
            {porForma.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1 text-sm">
                <span className="text-muted-foreground">{k} · {v.qtd}</span>
                <span className="font-medium">{brl(v.total)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium mb-2">O que estamos vendendo</p>
            {porProduto.length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
            {porProduto.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1 text-sm gap-3">
                <span className="text-muted-foreground truncate">{k} · {v.qtd}</span>
                <span className="font-medium shrink-0">{brl(v.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={filtroForma} onValueChange={setFiltroForma}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="todas">Todas as formas</SelectItem>
              {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="todos">Pagos e pendentes</SelectItem>
              <SelectItem value="pago">Somente pagos</SelectItem>
              <SelectItem value="aberto">Somente em aberto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && filtrados.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
        )}

        <div className="space-y-2">
          {filtrados.map((l) => {
            const n = l.parcelas ?? 1;
            const vp = l.valor_parcela ?? Number(l.valor) / n;
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <button onClick={() => alternarPago(l)} title={l.pago ? "Marcar como pendente" : "Marcar como pago"}>
                  {l.pago ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {nomePaciente(l.paciente_id)} <span className="text-muted-foreground">· {l.descricao}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.forma_pagamento}
                    {n > 1 ? ` · ${n}x de ${brl(Number(vp))}` : " · à vista"}
                    {l.vencimento ? ` · vence ${format(new Date(l.vencimento + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                    {l.pago && l.data_pagamento ? ` · pago em ${format(new Date(l.data_pagamento + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                  </p>
                  {l.observacoes && <p className="text-[11px] text-muted-foreground truncate">{l.observacoes}</p>}
                </div>
                <span className={cn("text-sm font-semibold", l.pago ? "text-success" : "text-accent")}>
                  {brl(Number(l.valor))}
                </span>
                <button onClick={() => excluir(l.id)} className="text-destructive/70 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
