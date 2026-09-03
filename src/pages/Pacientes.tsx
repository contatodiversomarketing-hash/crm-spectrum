import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, User, Baby, Phone, Mail } from "lucide-react";
import { format } from "date-fns";
import { PacienteDialog, Paciente } from "@/components/pacientes/PacienteDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CAMPOS =
  "id, nome, email, telefone, cpf, data_nascimento, tipo, cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, responsavel_nome, responsavel_cpf, responsavel_data_nascimento, responsavel_telefone, responsavel_email, responsavel_parentesco, responsavel_endereco_mesmo, responsavel_cep, responsavel_logradouro, responsavel_numero, responsavel_complemento, responsavel_bairro, responsavel_cidade, responsavel_estado";

export default function Pacientes() {
  const { profile } = useAuth();
  const [itens, setItens] = useState<Paciente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Paciente | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("pacientes").select(CAMPOS).order("nome");
    setLoading(false);
    if (error) { toast.error("Erro ao carregar pacientes"); return; }
    setItens((data ?? []) as unknown as Paciente[]);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((p) =>
      [p.nome, p.cpf, p.telefone, p.email, p.responsavel_nome]
        .some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [itens, busca]);

  const abrir = (p: Paciente | null) => { setSel(p); setOpen(true); };

  const telefonePre = searchParams.get("telefone") || "";
  const nomePre = searchParams.get("nome") || "";

  useEffect(() => {
    if (telefonePre) { setSel(null); setOpen(true); }
  }, [telefonePre]);

  const fecharDialog = (v: boolean) => {
    setOpen(v);
    if (!v && (telefonePre || nomePre)) setSearchParams({}, { replace: true });
  };

  return (
    <div className="bg-background min-h-full">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b bg-card/50">
        <div>
          <h1 className="text-2xl font-display">Pacientes</h1>
          <p className="text-xs text-muted-foreground">Cadastro, prontuário e financeiro</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF, telefone..." className="pl-9 w-72" />
          </div>
          <Button onClick={() => abrir(null)}><Plus className="h-4 w-4 mr-1" /> Novo paciente</Button>
        </div>
      </div>

      <div className="p-6">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && filtrados.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum paciente cadastrado ainda.</p>
        )}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((p) => (
            <button key={p.id} onClick={() => abrir(p)}
              className="text-left rounded-lg border bg-card p-4 hover:border-primary transition-colors">
              <div className="flex items-start gap-3">
                <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                  p.tipo === "crianca" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary")}>
                  {p.tipo === "crianca" ? <Baby className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.nome || "Sem nome"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.tipo === "crianca" ? "Criança / adolescente" : "Adulto"}
                    {p.data_nascimento ? ` · ${format(new Date(p.data_nascimento + "T00:00:00"), "dd/MM/yyyy")}` : ""}
                  </p>
                  {p.telefone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3" /> {p.telefone}
                    </p>
                  )}
                  {p.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" /> {p.email}
                    </p>
                  )}
                  {p.tipo === "crianca" && p.responsavel_nome && (
                    <p className="text-[11px] text-muted-foreground mt-1">Resp.: {p.responsavel_nome}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <PacienteDialog open={open} onOpenChange={fecharDialog} paciente={sel}
        valoresIniciais={sel ? undefined : { telefone: telefonePre, nome: nomePre }}
        autorNome={profile?.nome || profile?.email || "Equipe"} onSaved={carregar} />
    </div>
  );
}
