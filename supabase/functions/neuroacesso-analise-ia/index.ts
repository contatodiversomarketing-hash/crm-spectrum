import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateResponse, GatewayError } from "npm:@lovable.dev/ai-gateway";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Você é a analista do Método NeuroAcesso, mentoria da Dra. Amélia Carvalho para médicas e clínicas que atendem neurodesenvolvimento (TEA, TDAH).
Você conversa SOMENTE com a equipe interna da Dra. Amélia.

Papéis:
1. APRENDER: quando a equipe ensinar algo sobre o método, critérios de análise, formato de relatório ou preferências, confirme em 1-2 frases o que entendeu. Todos os ensinamentos anteriores aparecem abaixo e você deve aplicá-los sempre.
2. ANALISAR: quando receber as respostas de um questionário de uma mentorada, produza um relatório de sugestões para essa pessoa, aplicando o método e os ensinamentos. Estrutura padrão (a menos que a equipe ensine outra):
   - Resumo do cenário atual
   - Pontos fortes
   - Principais gargalos
   - Sugestões práticas priorizadas (o que fazer primeiro, depois, em seguida)
   - Próximos passos na mentoria
3. Responder dúvidas da equipe sobre análises já feitas.

Regras: português brasileiro, tom profissional e acolhedor. Nunca invente dados que a mentorada não respondeu; aponte lacunas. Use markdown com títulos e listas.`;

function extrairTexto(r: any): string {
  if (typeof r?.output_text === "string" && r.output_text.trim()) return r.output_text.trim();
  const partes: string[] = [];
  for (const item of r?.output ?? []) {
    for (const c of item?.content ?? []) if (c?.type === "output_text" && c.text) partes.push(c.text);
  }
  return partes.join("\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Não autenticado" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!roles?.some((r) => r.role === "admin" || r.role === "supervisao")) return json({ error: "Sem permissão" }, 403);

    const { mensagem, ensinamento, resposta_id, questionario_texto } = await req.json();
    if (!mensagem || typeof mensagem !== "string") return json({ error: "Mensagem vazia" }, 400);

    const { data: perfil } = await admin.from("profiles").select("nome").eq("user_id", u.user.id).maybeSingle();
    let conteudo = mensagem.trim();
    if (questionario_texto) conteudo += `\n\n---\nRESPOSTAS DO QUESTIONÁRIO:\n${String(questionario_texto).slice(0, 60000)}`;

    const { error: insErr } = await admin.from("neuroacesso_ia_mensagens").insert({
      role: "user", conteudo, ensinamento: !!ensinamento, resposta_id: resposta_id || null,
      autor_id: u.user.id, autor_nome: perfil?.nome || u.user.email,
    });
    if (insErr) throw insErr;

    const { data: ens } = await admin.from("neuroacesso_ia_mensagens").select("conteudo, autor_nome")
      .eq("ensinamento", true).order("criado_em");
    const { data: hist } = await admin.from("neuroacesso_ia_mensagens").select("role, conteudo")
      .order("criado_em", { ascending: false }).limit(30);

    const ensinamentos = (ens || []).map((e, i) => `${i + 1}. ${e.conteudo}`).join("\n");
    const instructions = SYSTEM + (ensinamentos ? `\n\n## ENSINAMENTOS DA EQUIPE (aplique sempre)\n${ensinamentos}` : "");
    const input = (hist || []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.conteudo,
    }));

    const resp = await generateResponse({ model: "openai/gpt-6-astra", instructions, input } as any);
    const texto = extrairTexto(resp) || "Não consegui gerar uma resposta. Pode tentar novamente?";

    const { error: e2 } = await admin.from("neuroacesso_ia_mensagens").insert({
      role: "assistant", conteudo: texto, resposta_id: resposta_id || null,
    });
    if (e2) throw e2;
    return json({ ok: true });
  } catch (e) {
    console.error("[neuroacesso-analise-ia]", e);
    if (e instanceof GatewayError) {
      const msg = e.httpStatus === 429 ? "Muitas solicitações, aguarde um instante."
        : e.httpStatus === 402 ? "Créditos de IA esgotados." : "Falha ao gerar a análise.";
      return json({ error: msg }, 200);
    }
    return json({ error: "Erro interno" }, 500);
  }
});
