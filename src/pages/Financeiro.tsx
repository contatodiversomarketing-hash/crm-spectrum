import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Search, Plus, Trash2, CheckCircle2, Circle, Upload, Receipt, X } from "lucide-react";
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
  comprovante_path: string | null;
  tem_sinal: boolean;
  sinal_valor: number | null;
  sinal_forma: string | null;
  sinal_pago: boolean;
  sinal_data: string | null;
  restante_forma: string | null;
  restante_pago: boolean;
  restante_data: string | null;
  criado_em: string;
}

interface PacienteMin { id: string; nome: string | null; telefone: string | null }

const FORMAS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Boleto", "Transferência"];
const PARCELAVEIS = ["Cartão de crédito", "Boleto"];
const COM_COMPROVANTE = ["Pix", "Cartão de crédito", "Cartão de débito"];
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
  const [recibo, setRecibo] = useState<File | null>(null);
  const inputRecibo = useRef<HTMLInputElement>(null);
  const [temSinal, setTemSinal] = useState("false");
  const [sinalValor, setSinalValor] = useState("");
  const [sinalForma, setSinalForma] = useState(FORMAS[0]);
  const [sinalPago, setSinalPago] = useState("false");
  const [restanteForma, setRestanteForma] = useState(FORMAS[0]);
  const [restantePago, setRestantePago] = useState("false");

  const carregar = useCallback(async () => {
    setLoading(true);
    const [lanc, pac] = await Promise.all([
      supabase.from("financeiro_lancamentos")
        .select("id, paciente_id, descricao, valor, forma_pagamento, parcelas, valor_parcela, pago, vencimento, data_pagamento, observacoes, comprovante_path, tem_sinal, sinal_valor, sinal_forma, sinal_pago, sinal_data, restante_forma, restante_pago, restante_data, criado_em")
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

  const comSinal = temSinal === "true";
  const podeParcelar = PARCELAVEIS.includes(comSinal ? restanteForma : forma);
  const valorNum = Number(String(valor).replace(",", ".")) || 0;
  const sinalNum = Number(String(sinalValor).replace(",", ".")) || 0;
  const nParcelas = podeParcelar ? Math.max(1, Number(parcelas) || 1) : 1;
  const baseParcela = comSinal ? Math.max(0, valorNum - sinalNum) : valorNum;
  const parcelaCalc = baseParcela > 0 ? baseParcela / nParcelas : 0;
  const pedeComprovante = COM_COMPROVANTE.includes(comSinal ? sinalForma : forma);

  const abrirRecibo = async (path: string) => {
    const { data } = await supabase.storage.from("prontuarios").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Não foi possível abrir o recibo");
  };

  const enviarRecibo = async (pid: string, file: File) => {
    const path = `comprovantes/${pid}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("prontuarios").upload(path, file);
    if (error) { toast.error("Não foi possível enviar o recibo"); return null; }
    return path;
  };

  const anexarRecibo = async (l: Lancamento, file: File) => {
    const path = await enviarRecibo(l.paciente_id, file);
    if (!path) return;
    await supabase.from("financeiro_lancamentos").update({ comprovante_path: path }).eq("id", l.id);
    toast.success("Recibo anexado");
    carregar();
  };

  const salvar = async () => {
    if (!pacienteId) { toast.error("Escolha o paciente"); return; }
    const desc = descricao === "Outro" ? descricaoLivre.trim() : descricao;
    if (!desc) { toast.error("Informe o que foi vendido"); return; }
    if (!valorNum || valorNum <= 0) { toast.error("Informe um valor válido"); return; }
    if (comSinal && (sinalNum <= 0 || sinalNum > valorNum)) {
      toast.error("Informe um valor de entrada válido"); return;
    }
    const sPago = comSinal && sinalPago === "true";
    const rPago = comSinal ? restantePago === "true" : pago === "true";
    const estaPago = comSinal ? sPago && rPago : pago === "true";
    const comprovante = recibo ? await enviarRecibo(pacienteId, recibo) : null;
    const hj = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("financeiro_lancamentos").insert({
      comprovante_path: comprovante,
      paciente_id: pacienteId,
      descricao: desc,
      valor: valorNum,
      forma_pagamento: comSinal ? restanteForma : forma,
      parcelas: nParcelas,
      valor_parcela: Number(parcelaCalc.toFixed(2)),
      pago: estaPago,
      vencimento: vencimento || null,
      data_pagamento: estaPago ? hj : null,
      observacoes: observacoes.trim() || null,
      tem_sinal: comSinal,
      sinal_valor: comSinal ? sinalNum : null,
      sinal_forma: comSinal ? sinalForma : null,
      sinal_pago: sPago,
      sinal_data: sPago ? hj : null,
      restante_forma: comSinal ? restanteForma : null,
      restante_pago: rPago,
      restante_data: rPago ? hj : null,
    });
    if (error) { toast.error("Erro ao lançar: " + error.message); return; }
    toast.success("Venda registrada");
    setValor(""); setVencimento(""); setObservacoes(""); setDescricaoLivre(""); setParcelas("1"); setRecibo(null);
    setSinalValor(""); setSinalPago("false"); setRestantePago("false");
    setOpen(false);
    carregar();
  };

  const alternarSinal = async (l: Lancamento) => {
    const novo = !l.sinal_pago;
    const hj = new Date().toISOString().slice(0, 10);
    await supabase.from("financeiro_lancamentos").update({
      sinal_pago: novo, sinal_data: novo ? hj : null,
      pago: novo && l.restante_pago,
      data_pagamento: novo && l.restante_pago ? hj : null,
    }).eq("id", l.id);
    carregar();
  };

  const alternarRestante = async (l: Lancamento) => {
    const novo = !l.restante_pago;
    const hj = new Date().toISOString().slice(0, 10);
    await supabase.from("financeiro_lancamentos").update({
      restante_pago: novo, restante_data: novo ? hj : null,
      pago: novo && (!l.tem_sinal || l.sinal_pago),
      data_pagamento: novo && (!l.tem_sinal || l.sinal_pago) ? hj : null,
    }).eq("id", l.id);
    carregar();
  };

  const alternarPago = async (l: Lancamento) => {
    if (l.tem_sinal) { alternarRestante(l); return; }
    const novo = !l.pago;
    const { error } = await supabase.from("financeiro_lancamentos")
      .update({ pago: novo, restante_pago: novo, data_pagamento: novo ? new Date().toISOString().slice(0, 10) : null })
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
                    <Label>Tem entrada (sinal)?</Label>
                    <Select value={temSinal} onValueChange={setTemSinal}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="false">Não, pagamento único</SelectItem>
                        <SelectItem value="true">Sim, com entrada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!comSinal && (
                  <div className="space-y-1.5">
                    <Label>Forma de pagamento</Label>
                    <Select value={forma} onValueChange={setForma}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {comSinal && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Valor da entrada (R$)</Label>
                        <Input value={sinalValor} onChange={(e) => setSinalValor(e.target.value)} placeholder="150,00" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Forma da entrada</Label>
                        <Select value={sinalForma} onValueChange={setSinalForma}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Entrada (sinal) já foi paga?</Label>
                        <Select value={sinalPago} onValueChange={setSinalPago}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value="false">Aguardando</SelectItem>
                            <SelectItem value="true">Sim, baixa feita</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Restante {brl(Math.max(0, valorNum - sinalNum))} — forma</Label>
                        <Select value={restanteForma} onValueChange={setRestanteForma}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Restante já foi pago?</Label>
                      <Select value={restantePago} onValueChange={setRestantePago}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          <SelectItem value="false">Aguardando</SelectItem>
                          <SelectItem value="true">Sim, baixa feita</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {podeParcelar && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Quantas vezes {comSinal ? "(restante)" : ""}</Label>
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
                  {!comSinal && (
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
                  )}
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
                {pedeComprovante && (
                  <div className="space-y-1.5">
                    <Label>Foto do recibo do pagamento</Label>
                    <input ref={inputRecibo} type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={(e) => { setRecibo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => inputRecibo.current?.click()}>
                        <Upload className="h-4 w-4 mr-2" /> Anexar recibo
                      </Button>
                      {recibo && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {recibo.name}
                          <button onClick={() => setRecibo(null)} title="Remover"><X className="h-3.5 w-3.5" /></button>
                        </span>
                      )}
                    </div>
                  </div>
                )}
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
              <div key={l.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-3">
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
                  {l.comprovante_path ? (
                    <button onClick={() => abrirRecibo(l.comprovante_path!)} title="Ver recibo" className="text-primary">
                      <Receipt className="h-4 w-4" />
                    </button>
                  ) : (
                    <label title="Anexar recibo" className="cursor-pointer text-muted-foreground hover:text-foreground">
                      <Upload className="h-4 w-4" />
                      <input type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexarRecibo(l, f); }} />
                    </label>
                  )}
                  <button onClick={() => excluir(l.id)} className="text-destructive/70 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {l.tem_sinal && (
                  <div className="flex flex-wrap gap-4 pl-8 text-[11px]">
                    <button onClick={() => alternarSinal(l)} className="flex items-center gap-1.5">
                      {l.sinal_pago ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                      <span className={l.sinal_pago ? "text-success" : "text-muted-foreground"}>
                        Entrada {brl(Number(l.sinal_valor ?? 0))} · {l.sinal_forma}
                        {l.sinal_pago && l.sinal_data ? ` · pago em ${format(new Date(l.sinal_data + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                      </span>
                    </button>
                    <button onClick={() => alternarRestante(l)} className="flex items-center gap-1.5">
                      {l.restante_pago ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                      <span className={l.restante_pago ? "text-success" : "text-muted-foreground"}>
                        Restante {brl(Number(l.valor) - Number(l.sinal_valor ?? 0))} · {l.restante_forma}
                        {l.restante_pago && l.restante_data ? ` · pago em ${format(new Date(l.restante_data + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
