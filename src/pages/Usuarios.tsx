import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KeyRound, Loader2, Shield, Trash2, UserPlus, Users } from "lucide-react";

type AppRole = "admin" | "supervisao" | "analista" | "auxiliar";

interface Usuario {
  user_id: string;
  nome: string;
  email: string;
  ativo: boolean;
  criado_em: string;
  roles: AppRole[];
}

const ROLES: { value: AppRole; label: string; descricao: string }[] = [
  { value: "admin", label: "Administrador", descricao: "Acesso total à plataforma" },
  { value: "supervisao", label: "Supervisão", descricao: "Acompanha e aprova as respostas da Ana" },
  { value: "analista", label: "Analista", descricao: "Painel e dashboards de inteligência" },
  { value: "auxiliar", label: "Auxiliar", descricao: "Somente Agenda, Pacientes e CRM" },
];

const roleLabel = (r: AppRole) => ROLES.find((x) => x.value === r)?.label ?? r;

export default function Usuarios() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [senhaAlvo, setSenhaAlvo] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [excluirAlvo, setExcluirAlvo] = useState<Usuario | null>(null);

  const [form, setForm] = useState<{ nome: string; email: string; senha: string; roles: AppRole[] }>({
    nome: "", email: "", senha: "", roles: ["auxiliar"],
  });

  const chamar = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-usuarios", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chamar({ action: "listar" });
      setUsuarios(data.usuarios ?? []);
    } catch (e) {
      toast({ title: "Erro ao carregar usuários", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [chamar, toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    setSalvando(true);
    try {
      await chamar({ action: "criar", ...form });
      toast({ title: "Usuário criado", description: `${form.nome} já pode acessar a plataforma.` });
      setNovoOpen(false);
      setForm({ nome: "", email: "", senha: "", roles: ["auxiliar"] });
      carregar();
    } catch (e) {
      toast({ title: "Erro ao criar usuário", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const alterarRoles = async (u: Usuario, role: AppRole, marcado: boolean) => {
    const roles = marcado ? [...u.roles, role] : u.roles.filter((r) => r !== role);
    if (roles.length === 0) {
      toast({ title: "Selecione ao menos um perfil", variant: "destructive" });
      return;
    }
    setUsuarios((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, roles } : x)));
    try {
      await chamar({ action: "atualizar_roles", user_id: u.user_id, roles });
    } catch (e) {
      toast({ title: "Erro ao atualizar acessos", description: (e as Error).message, variant: "destructive" });
      carregar();
    }
  };

  const salvarSenha = async () => {
    if (!senhaAlvo) return;
    setSalvando(true);
    try {
      await chamar({ action: "alterar_senha", user_id: senhaAlvo.user_id, senha: novaSenha });
      toast({ title: "Senha atualizada" });
      setSenhaAlvo(null);
      setNovaSenha("");
    } catch (e) {
      toast({ title: "Erro ao alterar senha", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!excluirAlvo) return;
    setSalvando(true);
    try {
      await chamar({ action: "excluir", user_id: excluirAlvo.user_id });
      toast({ title: "Usuário excluído" });
      setExcluirAlvo(null);
      carregar();
    } catch (e) {
      toast({ title: "Erro ao excluir", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie contas e defina o que cada pessoa da equipe pode acessar.
          </p>
        </div>

        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
              <DialogDescription>A conta já entra confirmada e pronta para uso.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Dra. Amélia Carvalho" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-2">
                <Label>Senha provisória</Label>
                <Input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label>Perfis de acesso</Label>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <label key={r.value} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={form.roles.includes(r.value)}
                        onCheckedChange={(c) =>
                          setForm({
                            ...form,
                            roles: c ? [...form.roles, r.value] : form.roles.filter((x) => x !== r.value),
                          })
                        }
                      />
                      <span>
                        <span className="text-sm font-medium block">{r.label}</span>
                        <span className="text-xs text-muted-foreground">{r.descricao}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
              <Button onClick={criar} disabled={salvando}>
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar usuário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Equipe</CardTitle>
          <CardDescription>
            Auxiliar enxerga apenas Agenda, Pacientes e CRM. Administrador tem acesso a tudo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum usuário cadastrado ainda.</p>
          ) : (
            usuarios.map((u) => (
              <div key={u.user_id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {u.nome || "Sem nome"}
                      {u.user_id === user?.id && <Badge variant="secondary" className="ml-2">você</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setSenhaAlvo(u); setNovaSenha(""); }}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    {u.user_id !== user?.id && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setExcluirAlvo(u)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {ROLES.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={u.roles.includes(r.value)}
                        onCheckedChange={(c) => alterarRoles(u, r.value, !!c)}
                      />
                      {roleLabel(r.value)}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!senhaAlvo} onOpenChange={(o) => !o && setSenhaAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para {senhaAlvo?.nome || senhaAlvo?.email}.</DialogDescription>
          </DialogHeader>
          <Input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Nova senha (mín. 6 caracteres)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSenhaAlvo(null)}>Cancelar</Button>
            <Button onClick={salvarSenha} disabled={salvando || novaSenha.length < 6}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluirAlvo} onOpenChange={(o) => !o && setExcluirAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluirAlvo?.nome || excluirAlvo?.email} perderá o acesso imediatamente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); excluir(); }}
              disabled={salvando}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
