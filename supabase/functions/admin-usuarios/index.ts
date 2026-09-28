import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ROLES_VALIDAS = ["admin", "supervisao", "analista", "auxiliar"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Apenas administradores podem gerenciar usuários" }, 403);

    const body = await req.json();
    const action = body.action as string;

    if (action === "listar") {
      const { data: profiles, error } = await admin
        .from("profiles")
        .select("user_id, nome, email, ativo, criado_em")
        .order("criado_em", { ascending: true });
      if (error) throw error;

      const { data: roles } = await admin.from("user_roles").select("user_id, role");
      const usuarios = (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
      }));
      return json({ usuarios });
    }

    if (action === "criar") {
      const { email, senha, nome, roles } = body as {
        email: string; senha: string; nome: string; roles: string[];
      };
      if (!email || !senha || !nome) return json({ error: "Nome, email e senha são obrigatórios" }, 200);
      if (senha.length < 6) return json({ error: "A senha precisa ter ao menos 6 caracteres" }, 200);
      const rolesFiltradas = (roles ?? []).filter((r) => ROLES_VALIDAS.includes(r));
      if (rolesFiltradas.length === 0) return json({ error: "Selecione ao menos um perfil de acesso" }, 200);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (createErr) {
        const msg = /weak|easy to guess|pwned/i.test(createErr.message)
          ? "Essa senha é muito fraca ou comum. Use uma senha com letras, números e símbolos (ex.: Amelia@2026!)."
          : /already registered|already been registered|exists/i.test(createErr.message)
            ? "Já existe um usuário com esse email."
            : createErr.message;
        return json({ error: msg }, 200);
      }

      const novoId = created.user!.id;
      await admin.from("profiles").upsert(
        { user_id: novoId, nome, email },
        { onConflict: "user_id" },
      );
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert(rolesFiltradas.map((role) => ({ user_id: novoId, role })));
      if (roleErr) return json({ error: roleErr.message }, 200);

      return json({ ok: true, user_id: novoId });
    }

    if (action === "atualizar_roles") {
      const { user_id, roles } = body as { user_id: string; roles: string[] };
      const rolesFiltradas = (roles ?? []).filter((r) => ROLES_VALIDAS.includes(r));
      if (!user_id) return json({ error: "Usuário inválido" }, 200);
      if (rolesFiltradas.length === 0) return json({ error: "Selecione ao menos um perfil de acesso" }, 200);

      await admin.from("user_roles").delete().eq("user_id", user_id);
      const { error } = await admin
        .from("user_roles")
        .insert(rolesFiltradas.map((role) => ({ user_id, role })));
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    if (action === "alterar_senha") {
      const { user_id, senha } = body as { user_id: string; senha: string };
      if (!user_id || !senha || senha.length < 6) return json({ error: "Senha inválida" }, 200);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: senha });
      if (error) {
        const msg = /weak|easy to guess|pwned/i.test(error.message)
          ? "Essa senha é muito fraca ou comum. Use uma senha com letras, números e símbolos (ex.: Amelia@2026!)."
          : error.message;
        return json({ error: msg }, 200);
      }
      return json({ ok: true });
    }

    if (action === "ativar") {
      const { user_id, ativo } = body as { user_id: string; ativo: boolean };
      const { error } = await admin.from("profiles").update({ ativo }).eq("user_id", user_id);
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    if (action === "excluir") {
      const { user_id } = body as { user_id: string };
      if (!user_id) return json({ error: "Usuário inválido" }, 200);
      if (user_id === user.id) return json({ error: "Você não pode excluir sua própria conta" }, 200);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 200);
  } catch (e) {
    console.error("admin-usuarios error", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
