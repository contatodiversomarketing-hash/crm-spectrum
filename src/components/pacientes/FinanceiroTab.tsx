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
}

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

export function FinanceiroTab({ pacienteId }: { pacienteId: string }) {
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [descricao, setDescricao] = useState(PRODUTOS[0]);
  const [descricaoLivre, setDescricaoLivre] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState(FORMAS[0]);
  const [pago, setPago] = useState("false");
  const [vencimento, setVencimento] = useState("");
  const [parcelas, setParcelas] = useState("1");

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("financeiro_lancamentos")
      .select("id, descricao, valor, forma_pagamento, parcelas, valor_parcela, pago, vencimento, data_pagamento")
      .eq("paciente_id", pacienteId).order("criado_em", { ascending: false });
    setItens((data ?? []) as Lancamento[]);
  }, [pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const podeParcelar = PARCELAVEIS.includes(forma);

  const adicionar = async () => {
    const desc = descricao === "Outro" ? descricaoLivre.trim() : descricao;
    if (!desc) { toast.error("Informe a descrição"); return; }
    const v = Number(String(valor).replace(",", "."));
    if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
    const estaPago = pago === "true";
    const n = podeParcelar ? Math.max(1, Number(parcelas) || 1) : 1;
    const { error } = await supabase.from("financeiro_lancamentos").insert({
      paciente_id: pacienteId, descricao: desc, valor: v, forma_pagamento: forma,
      parcelas: n, valor_parcela: Number((v / n).toFixed(2)),
      pago: estaPago, vencimento: vencimento || null,
      data_pagamento: estaPago ? new Date().toISOString().slice(0, 10) : null,
    });
    if (error) { toast.error("Erro ao lançar: " + error.message); return; }
    setValor(""); setVencimento(""); setDescricaoLivre(""); setParcelas("1");
    toast.success("Lançamento registrado");
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

  const total = itens.reduce((s, i) => s + Number(i.valor), 0);
  const pagoTotal = itens.filter((i) => i.pago).reduce((s, i) => s + Number(i.valor), 0);
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
            <Label>Valor (R$)</Label>
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
          {podeParcelar && (
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
        </div>
        <Button onClick={adicionar}>Lançar</Button>
      </div>

      <div className="space-y-2">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>}
        {itens.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
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
            <button onClick={() => excluir(l.id)} className="text-destructive/70 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
