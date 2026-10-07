import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2, CheckCircle2, Circle, Upload, Receipt, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  valor_parcela: number | null;
  pago: boolean;
  vencimento: string | null;
  data_pagamento: string | null;
  comprovante_path: string | null;
  comprovantes: string[] | null;
  tem_sinal: boolean;
  sinal_valor: number | null;
  sinal_forma: string | null;
  sinal_pago: boolean;
  sinal_data: string | null;
  restante_forma: string | null;
  restante_pago: boolean;
  restante_data: string | null;
}

const CAMPOS =
  "id, descricao, valor, forma_pagamento, parcelas, valor_parcela, pago, vencimento, data_pagamento, comprovante_path, comprovantes, tem_sinal, sinal_valor, sinal_forma, sinal_pago, sinal_data, restante_forma, restante_pago, restante_data";

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

const hoje = () => new Date().toISOString().slice(0, 10);

export function FinanceiroTab({ pacienteId }: { pacienteId: string }) {
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [descricao, setDescricao] = useState(PRODUTOS[0]);
  const [descricaoLivre, setDescricaoLivre] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState(FORMAS[0]);
  const [pago, setPago] = useState("false");
  const [vencimento, setVencimento] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [recibo, setRecibo] = useState<File[]>([]);
  const inputRecibo = useRef<HTMLInputElement>(null);
  // entrada / sinal
  const [temSinal, setTemSinal] = useState("false");
  const [sinalValor, setSinalValor] = useState("");
  const [sinalForma, setSinalForma] = useState(FORMAS[0]);
  const [sinalPago, setSinalPago] = useState("false");
  const [restanteForma, setRestanteForma] = useState(FORMAS[0]);
  const [restantePago, setRestantePago] = useState("false");

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("financeiro_lancamentos")
      .select(CAMPOS)
      .eq("paciente_id", pacienteId).order("criado_em", { ascending: false });
    setItens((data ?? []) as unknown as Lancamento[]);
  }, [pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const comSinal = temSinal === "true";
  const podeParcelar = PARCELAVEIS.includes(comSinal ? restanteForma : forma);
  const pedeComprovante = COM_COMPROVANTE.includes(comSinal ? sinalForma : forma);

  const listaRecibos = (l: Lancamento) =>
    l.comprovantes && l.comprovantes.length ? l.comprovantes : l.comprovante_path ? [l.comprovante_path] : [];

  const abrirRecibo = async (path: string) => {
    const { data } = await supabase.storage.from("prontuarios").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Não foi possível abrir o recibo");
  };

  const enviarRecibo = async (file: File) => {
    const path = `comprovantes/${pacienteId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("prontuarios").upload(path, file);
    if (error) { toast.error("Não foi possível enviar o recibo"); return null; }
    return path;
  };

  const anexarRecibo = async (l: Lancamento, file: File) => {
    const path = await enviarRecibo(file);
    if (!path) return;
    await supabase.from("financeiro_lancamentos").update({ comprovante_path: l.comprovante_path ?? path, comprovantes: [...listaRecibos(l), path] }).eq("id", l.id);
    toast.success("Recibo anexado");
    carregar();
  };

  const adicionar = async () => {
    const desc = descricao === "Outro" ? descricaoLivre.trim() : descricao;
    if (!desc) { toast.error("Informe a descrição"); return; }
    const v = Number(String(valor).replace(",", "."));
    if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
    const sv = Number(String(sinalValor).replace(",", ".")) || 0;
    if (comSinal && (sv <= 0 || sv > v)) { toast.error("Informe um valor de entrada válido"); return; }
    const sPago = comSinal && sinalPago === "true";
    const rPago = comSinal ? restantePago === "true" : pago === "true";
    const estaPago = comSinal ? sPago && rPago : pago === "true";
    const n = podeParcelar ? Math.max(1, Number(parcelas) || 1) : 1;
    const base = comSinal ? v - sv : v;
    const comprovantesEnviados: string[] = [];
    for (const r of recibo) { const p = await enviarRecibo(r); if (p) comprovantesEnviados.push(p); }
    const comprovante = comprovantesEnviados[0] ?? null;
    const { error } = await supabase.from("financeiro_lancamentos").insert({
      paciente_id: pacienteId, descricao: desc, valor: v,
      forma_pagamento: comSinal ? restanteForma : forma,
      parcelas: n, valor_parcela: Number((base / n).toFixed(2)),
      pago: estaPago, vencimento: vencimento || null,
      data_pagamento: estaPago ? hoje() : null,
      comprovante_path: comprovante, comprovantes: comprovantesEnviados,
      tem_sinal: comSinal,
      sinal_valor: comSinal ? sv : null,
      sinal_forma: comSinal ? sinalForma : null,
      sinal_pago: sPago,
      sinal_data: sPago ? hoje() : null,
      restante_forma: comSinal ? restanteForma : null,
      restante_pago: rPago,
      restante_data: rPago ? hoje() : null,
    });
    if (error) { toast.error("Erro ao lançar: " + error.message); return; }
    setValor(""); setVencimento(""); setDescricaoLivre(""); setParcelas("1"); setRecibo([]);
    setSinalValor(""); setSinalPago("false"); setRestantePago("false");
    toast.success("Lançamento registrado");
    carregar();
  };

  const alternarSinal = async (l: Lancamento) => {
    const novo = !l.sinal_pago;
    await supabase.from("financeiro_lancamentos").update({
      sinal_pago: novo, sinal_data: novo ? hoje() : null,
      pago: novo && l.restante_pago,
      data_pagamento: novo && l.restante_pago ? hoje() : null,
    }).eq("id", l.id);
    carregar();
  };

  const alternarRestante = async (l: Lancamento) => {
    const novo = !l.restante_pago;
    await supabase.from("financeiro_lancamentos").update({
      restante_pago: novo, restante_data: novo ? hoje() : null,
      pago: novo && (!l.tem_sinal || l.sinal_pago),
      data_pagamento: novo && (!l.tem_sinal || l.sinal_pago) ? hoje() : null,
    }).eq("id", l.id);
    carregar();
  };

  const alternarPago = async (l: Lancamento) => {
    if (l.tem_sinal) { alternarRestante(l); return; }
    const novo = !l.pago;
    const { error } = await supabase.from("financeiro_lancamentos")
      .update({ pago: novo, data_pagamento: novo ? hoje() : null, restante_pago: novo })
      .eq("id", l.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    carregar();
  };

  const excluir = async (id: string) => {
    await supabase.from("financeiro_lancamentos").delete().eq("id", id);
    carregar();
  };

  const total = itens.reduce((s, i) => s + Number(i.valor), 0);
  const pagoTotal = itens.reduce((s, i) => {
    if (i.pago) return s + Number(i.valor);
    if (i.tem_sinal && i.sinal_pago) return s + Number(i.sinal_valor ?? 0);
    return s;
  }, 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">{brl(total)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Pago</p>
          <p className="text-lg font-semibold text-success">{brl(pagoTotal)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Em aberto</p>
          <p className="text-lg font-semibold text-accent">{brl(total - pagoTotal)}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>O que o paciente comprou</Label>
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
                <Label>Forma do restante</Label>
                <Select value={restanteForma} onValueChange={setRestanteForma}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
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
        </div>
        {pedeComprovante && (
          <div className="space-y-1.5">
            <Label>Foto do recibo do pagamento</Label>
            <input ref={inputRecibo} type="file" multiple accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); setRecibo((r) => [...r, ...fs]); e.target.value = ""; }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRecibo.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Anexar recibos
              </Button>
              {recibo.map((r, i) => (
<span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
{r.name}
<button onClick={() => setRecibo((l) => l.filter((_, j) => j !== i))} title="Remover"><X className="h-3.5 w-3.5" /></button>
</span>
))}
            </div>
          </div>
        )}
        <Button onClick={adicionar}>Lançar</Button>
      </div>

      <div className="space-y-2">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>}
        {itens.map((l) => (
          <div key={l.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-3">
              <button onClick={() => alternarPago(l)} title={l.pago ? "Marcar como pendente" : "Marcar como pago"}>
                {l.pago ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.descricao}</p>
                <p className="text-[11px] text-muted-foreground">
                  {l.forma_pagamento}
                  {(l.parcelas ?? 1) > 1 ? ` · ${l.parcelas}x de ${brl(Number(l.valor_parcela ?? Number(l.valor) / (l.parcelas ?? 1)))}` : ""}
                  {l.vencimento ? ` · vence ${format(new Date(l.vencimento + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                  {l.pago && l.data_pagamento ? ` · pago em ${format(new Date(l.data_pagamento + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                </p>
              </div>
              <span className={cn("text-sm font-semibold", l.pago ? "text-success" : "text-accent")}>{brl(Number(l.valor))}</span>
              {listaRecibos(l).map((p, i) => (
<button key={p} onClick={() => abrirRecibo(p)} title={`Ver recibo ${i + 1}`} className="text-primary flex items-center">
<Receipt className="h-4 w-4" />{listaRecibos(l).length > 1 && <span className="text-[10px]">{i + 1}</span>}
</button>
))}
<label title="Anexar mais um recibo" className="cursor-pointer text-muted-foreground hover:text-foreground">
                  <Upload className="h-4 w-4" />
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                    onChange={async (e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; for (const f of fs) await anexarRecibo(l, f); }} />
                </label>
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
        ))}
      </div>
    </div>
  );
}
