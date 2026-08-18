import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { nome, email, telefone, cpf, objetivo, sintomas, historico_saude, medicamentos_atuais, ...extras } = body;

    if (!telefone && !email) {
      return new Response(JSON.stringify({ error: "telefone ou email é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Salvar relatório de triagem
    const relatorioData = {
      nome: nome?.slice(0, 255) || null,
      email: email?.slice(0, 255) || null,
      telefone: telefone?.slice(0, 20) || null,
      cpf: cpf?.slice(0, 14) || null,
      objetivo: objetivo?.slice(0, 2000) || null,
      sintomas: sintomas?.slice(0, 2000) || null,
      historico_saude: historico_saude?.slice(0, 2000) || null,
      medicamentos_atuais: medicamentos_atuais?.slice(0, 2000) || null,
      dados_completos: body,
      status: "pendente",
      processado: false,
    };

    // 2. Verificar se já existe um lead com esse telefone
    let leadId: string | null = null;
    if (telefone) {
      const { data: leadExistente } = await supabase
        .from("leads")
        .select("id")
        .eq("telefone", telefone)
        .limit(1)
        .maybeSingle();

      if (leadExistente?.id) {
        leadId = leadExistente.id;
        // Atualizar dados do lead
        await supabase.from("leads").update({
          nome: nome || undefined,
          email: email || undefined,
          cpf: cpf || undefined,
          dados_triagem: body,
          status_pipeline: "triagem_recebida",
          ultima_interacao: new Date().toISOString(),
        }).eq("id", leadId);
      }
    }

    // 3. Se não existe lead, criar um novo
    if (!leadId) {
      const { data: novoLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          nome: nome || null,
          telefone: telefone || null,
          email: email || null,
          cpf: cpf || null,
          origem: "site_draamelia",
          status: "novo",
          status_pipeline: "triagem_recebida",
          dados_triagem: body,
          ultima_interacao: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (leadError) {
        console.error("[receber-triagem] Erro ao criar lead:", leadError);
      } else {
        leadId = novoLead?.id || null;
      }
    }

    // 4. Salvar relatório vinculado ao lead
    const { error: relatorioError } = await supabase
      .from("relatorios_triagem")
      .insert({ ...relatorioData, lead_id: leadId });

    if (relatorioError) {
      console.error("[receber-triagem] Erro ao salvar relatório:", relatorioError);
      return new Response(JSON.stringify({ error: "Erro ao salvar relatório" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Notificar admin via WhatsApp (se configurado)
    const MEGA_API_URL = Deno.env.get("MEGA_API_URL");
    const MEGA_API_TOKEN = Deno.env.get("MEGA_API_TOKEN");
    const ADMIN_WHATSAPP = Deno.env.get("ADMIN_WHATSAPP_NUMBER");

    if (MEGA_API_URL && MEGA_API_TOKEN && ADMIN_WHATSAPP) {
      try {
        const notificacao = `🆕 *Nova triagem recebida!*\n\n👤 ${nome || "Não informado"}\n📱 ${telefone || "Não informado"}\n📧 ${email || "Não informado"}\n🎯 Objetivo: ${objetivo || "Não informado"}\n\n_A Ana pode iniciar contato automaticamente._`;

        await fetch(`${MEGA_API_URL}/message/sendText/${MEGA_API_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: ADMIN_WHATSAPP,
            text: notificacao,
          }),
        });
        console.log("[receber-triagem] Notificação enviada ao admin");
      } catch (e) {
        console.warn("[receber-triagem] Erro ao notificar admin:", e);
      }
    }

    // 6. Se tem telefone, iniciar contato da Ana via WhatsApp
    if (telefone && MEGA_API_URL && MEGA_API_TOKEN) {
      try {
        const CORE_API_URL = Deno.env.get("CORE_API_URL") || Deno.env.get("SUPABASE_URL");
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        // Enviar primeira mensagem da Ana
        const primeiroNome = nome ? nome.split(" ")[0] : "";
        const saudacao = new Date().getUTCHours() - 3 < 12 ? "Bom dia" : new Date().getUTCHours() - 3 < 18 ? "Boa tarde" : "Boa noite";
        
        const msgInicial = primeiroNome
          ? `${saudacao}, ${primeiroNome}! 😊 Aqui é a Ana, da Dra. Amélia Carvalho. Vi que você preencheu nosso formulário sobre cannabis medicinal. Que bom que está buscando informações! Posso te ajudar a agendar uma consulta com nossa médica especialista?`
          : `${saudacao}! 😊 Aqui é a Ana, da Dra. Amélia Carvalho. Vi que você preencheu nosso formulário sobre cannabis medicinal. Que bom que está buscando informações! Posso te ajudar a agendar uma consulta com nossa médica especialista?`;

        await fetch(`${MEGA_API_URL}/message/sendText/${MEGA_API_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: telefone,
            text: msgInicial,
          }),
        });

        // Registrar interação
        await supabase.from("interacoes_ia").insert({
          paciente_externo_id: telefone,
          sistema_origem: "site_draamelia",
          canal: "whatsapp",
          mensagem_usuario: `[TRIAGEM SITE] Objetivo: ${objetivo || "N/I"} | Sintomas: ${sintomas || "N/I"}`,
          resposta_final: msgInicial,
          supervisionado: false,
          intencao_detectada: "agendamento",
          estado_conversa: "neutro",
        });

        console.log(`[receber-triagem] Ana enviou mensagem inicial para ${telefone}`);
      } catch (e) {
        console.warn("[receber-triagem] Erro ao enviar mensagem inicial:", e);
      }
    }

    console.log(`[receber-triagem] ✅ Triagem salva: ${nome || "sem nome"} - ${telefone || email}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Triagem recebida com sucesso",
      lead_id: leadId 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[receber-triagem] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});