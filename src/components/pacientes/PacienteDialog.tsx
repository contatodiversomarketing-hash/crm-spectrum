import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BotaoLigar } from "@/contexts/TwilioContext";
import { MessageSquare, Upload, FileText, X, Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { ProntuarioTab } from "./ProntuarioTab";
import { FinanceiroTab } from "./FinanceiroTab";

export interface Paciente {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  tipo: string;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; cidade: string | null; estado: string | null;
  observacoes: string | null;
  responsavel_nome: string | null; responsavel_cpf: string | null;
  responsavel_data_nascimento: string | null; responsavel_telefone: string | null;
  responsavel_email: string | null; responsavel_parentesco: string | null;
  responsavel_endereco_mesmo: boolean;
  responsavel_cep: string | null; responsavel_logradouro: string | null; responsavel_numero: string | null;
  responsavel_complemento: string | null; responsavel_bairro: string | null;
  responsavel_cidade: string | null; responsavel_estado: string | null;
}

const vazio = {
  nome: "", email: "", telefone: "", cpf: "", data_nascimento: "", tipo: "adulto",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  observacoes: "",
  responsavel_nome: "", responsavel_cpf: "", responsavel_data_nascimento: "",
  responsavel_telefone: "", responsavel_email: "", responsavel_parentesco: "",
  responsavel_endereco_mesmo: true,
  responsavel_cep: "", responsavel_logradouro: "", responsavel_numero: "",
  responsavel_complemento: "", responsavel_bairro: "", responsavel_cidade: "", responsavel_estado: "",
};

type Form = typeof vazio;

const schema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo").max(150),
  email: z.string().trim().email("E-mail inválido").max(255).or(z.literal("")),
  telefone: z.string().trim().min(8, "Telefone inválido").max(30),
  cpf: z.string().trim().max(20),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paciente: Paciente | null;
  autorNome: string;
  onSaved: () => void;
  valoresIniciais?: Partial<Form>;
}

export function PacienteDialog({ open, onOpenChange, paciente, autorNome, onSaved, valoresIniciais }: Props) {
  const [form, setForm] = useState<Form>(vazio);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState("dados");
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [anexos, setAnexos] = useState<{ id: string; nome: string; path: string }[]>([]);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const carregarAnexos = useCallback(async (pacienteId: string) => {
    const { data } = await supabase
      .from("prontuario_anexos")
      .select("id, nome, path")
      .eq("paciente_id", pacienteId)
      .order("criado_em", { ascending: false });
    setAnexos(data ?? []);
  }, []);

  const enviarArquivos = async (pacienteId: string, arquivos: File[]) => {
    for (const file of arquivos) {
      const path = `${pacienteId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("prontuarios").upload(path, file);
      if (upErr) { toast.error(`Não foi possível anexar ${file.name}`); continue; }
      await supabase.from("prontuario_anexos").insert({
        paciente_id: pacienteId, nome: file.name, path, mime: file.type, tamanho: file.size,
      });
    }
  };

  const abrirAnexo = async (a: { path: string }) => {
    const { data } = await supabase.storage.from("prontuarios").createSignedUrl(a.path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removerAnexo = async (a: { id: string; path: string }) => {
    await supabase.storage.from("prontuarios").remove([a.path]);
    await supabase.from("prontuario_anexos").delete().eq("id", a.id);
    setAnexos((l) => l.filter((x) => x.id !== a.id));
  };

  useEffect(() => {
    if (!open) return;
    setAba("dados");
    setPendentes([]);
    setAnexos([]);
    if (paciente) carregarAnexos(paciente.id);
    if (paciente) {
      const f: Form = { ...vazio };
      (Object.keys(vazio) as (keyof Form)[]).forEach((k) => {
        const v = (paciente as unknown as Record<string, unknown>)[k];
        (f as Record<string, unknown>)[k] = v ?? (typeof vazio[k] === "boolean" ? vazio[k] : "");
      });
      setForm(f);
    } else {
      setForm({ ...vazio, ...(valoresIniciais ?? {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paciente]);

  const set = (k: keyof Form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (form.tipo === "crianca" && !form.responsavel_nome.trim()) {
      toast.error("Informe o nome completo do responsável");
      return;
    }
    setSalvando(true);
    const payload = {
      ...form,
      email: form.email || null,
      data_nascimento: form.data_nascimento || null,
      responsavel_data_nascimento: form.responsavel_data_nascimento || null,
    };
    let pacienteId = paciente?.id ?? null;
    let error = null as { message: string } | null;
    if (paciente) {
      ({ error } = await supabase.from("pacientes").update(payload).eq("id", paciente.id));
    } else {
      const res = await supabase.from("pacientes").insert(payload).select("id").single();
      error = res.error;
      pacienteId = res.data?.id ?? null;
    }
    if (!error && pacienteId && pendentes.length) {
      await enviarArquivos(pacienteId, pendentes);
    }
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(paciente ? "Cadastro atualizado" : "Paciente cadastrado");
    onOpenChange(false);
    onSaved();
  };

  const excluirCadastro = async () => {
    if (!paciente) return;
    setSalvando(true);
    const paths = anexos.map((a) => a.path);
    if (paths.length) await supabase.storage.from("prontuarios").remove(paths);
    await supabase.from("prontuario_anexos").delete().eq("paciente_id", paciente.id);
    await supabase.from("prontuario_registros").delete().eq("paciente_id", paciente.id);
    await supabase.from("financeiro_lancamentos").delete().eq("paciente_id", paciente.id);
    await supabase.from("agendamentos").update({ paciente_id: null }).eq("paciente_id", paciente.id);
    const { error } = await supabase.from("pacientes").delete().eq("id", paciente.id);
    setSalvando(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Cadastro excluído");
    onOpenChange(false);
    onSaved();
  };

  const campo = (label: string, k: keyof Form, type = "text", ph = "") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={String(form[k] ?? "")} placeholder={ph}
        onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="font-display text-2xl">
              {paciente ? paciente.nome || "Paciente" : "Novo paciente"}
            </DialogTitle>
            {paciente?.telefone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/conversas?telefone=${encodeURIComponent(paciente.telefone || "")}`)
                }
              >
                <MessageSquare className="h-4 w-4 mr-1" /> Abrir conversa
              </Button>
            )}
            {paciente?.telefone && (
              <BotaoLigar telefone={paciente.telefone} nome={paciente.nome} pacienteId={paciente.id} className="h-9 w-9" />
            )}
          </div>
        </DialogHeader>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="dados">Dados cadastrais</TabsTrigger>
            <TabsTrigger value="prontuario" disabled={!paciente}>Prontuário</TabsTrigger>
            <TabsTrigger value="financeiro" disabled={!paciente}>Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-5 pt-4">
            <div className="space-y-1.5">
              <Label>Tipo de paciente</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="adulto">Adulto</SelectItem>
                  <SelectItem value="crianca">Criança / adolescente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {campo("Nome completo", "nome")}
              {campo("CPF", "cpf", "text", "000.000.000-00")}
              {campo("Data de nascimento", "data_nascimento", "date")}
              {campo("Telefone", "telefone", "text", "(00) 00000-0000")}
              {campo("E-mail", "email", "email")}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Endereço</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {campo("CEP", "cep")}
                <div className="sm:col-span-2">{campo("Logradouro", "logradouro")}</div>
                {campo("Número", "numero")}
                {campo("Complemento", "complemento")}
                {campo("Bairro", "bairro")}
                {campo("Cidade", "cidade")}
                {campo("Estado", "estado", "text", "UF")}
              </div>
            </div>

            {form.tipo === "crianca" && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-sm font-medium">Dados do responsável</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {campo("Nome completo", "responsavel_nome")}
                  {campo("Parentesco", "responsavel_parentesco", "text", "Mãe, pai, tutor...")}
                  {campo("CPF", "responsavel_cpf")}
                  {campo("Data de nascimento", "responsavel_data_nascimento", "date")}
                  {campo("Telefone", "responsavel_telefone")}
                  {campo("E-mail", "responsavel_email", "email")}
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={form.responsavel_endereco_mesmo}
                    onCheckedChange={(v) => set("responsavel_endereco_mesmo", v)} />
                  <Label className="cursor-pointer">O endereço do responsável é o mesmo do paciente</Label>
                </div>

                {!form.responsavel_endereco_mesmo && (
                  <div className="grid sm:grid-cols-3 gap-3">
                    {campo("CEP", "responsavel_cep")}
                    <div className="sm:col-span-2">{campo("Logradouro", "responsavel_logradouro")}</div>
                    {campo("Número", "responsavel_numero")}
                    {campo("Complemento", "responsavel_complemento")}
                    {campo("Bairro", "responsavel_bairro")}
                    {campo("Cidade", "responsavel_cidade")}
                    {campo("Estado", "responsavel_estado", "text", "UF")}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documentos anexados
              </p>
              <input
                ref={inputArquivo}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  if (fs.length) setPendentes((p) => [...p, ...fs]);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Anexar arquivos
              </Button>

              {(anexos.length > 0 || pendentes.length > 0) && (
                <ul className="space-y-1.5">
                  {anexos.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="truncate">{a.nome}</span>
                      <span className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => abrirAnexo(a)} title="Abrir">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removerAnexo(a)} title="Remover">
                          <X className="h-4 w-4" />
                        </Button>
                      </span>
                    </li>
                  ))}
                  {pendentes.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                      <span className="truncate">{f.name} <span className="text-muted-foreground">(envia ao salvar)</span></span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setPendentes((p) => p.filter((_, idx) => idx !== i))} title="Remover">
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              {paciente && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="mr-auto text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir cadastro
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir este cadastro?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O cadastro de {paciente.nome || "paciente"}, prontuário, anexos e lançamentos
                        financeiros serão apagados. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={excluirCadastro}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar cadastro"}</Button>
            </div>
          </TabsContent>

          <TabsContent value="prontuario" className="pt-4">
            {paciente && <ProntuarioTab pacienteId={paciente.id} autorNome={autorNome} />}
          </TabsContent>

          <TabsContent value="financeiro" className="pt-4">
            {paciente && <FinanceiroTab pacienteId={paciente.id} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
