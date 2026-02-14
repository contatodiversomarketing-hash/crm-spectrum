import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOP_N = 50;
const DIAS_BLOQUEIO = 30;
const SUPABASE_URL = "https://chilmuwijkkdefqizleh.supabase.co";
const ESPECIALIDADES_PREMIUM = ["odontologia", "estética", "estetica", "cardiologia"];

interface PacienteGestao {
  id: string;
  name: string;
  phone: string;
  last_appointment_date: string;
  status?: string;
  avg_ticket?: number;
  ticket_medio?: number;
  total_appointments?: number;
  total_consultas?: number;
  specialty?: string;
  especialidade?: string;
  total_absences?: number;
  total_faltas?: number;
}

function calcularScore(p: PacienteGestao): number {
  let score = 0;
  const ticket = p.ticket_medio ?? p.avg_ticket ?? 0;
  const consultas = p.total_consultas ?? p.total_appointments ?? 0;
  const esp = (p.especialidade ?? p.specialty ?? "").toLowerCase();
  const faltas = p.total_faltas ?? p.total_absences ?? 0;

  if (ticket >= 500) score += 40;
  if (consultas >= 3) score += 30;
  if (ESPECIALIDADES_PREMIUM.includes(esp)) score += 20;
  if (faltas >= 2) score -= 20;

  return score;
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const relatorio = { total_inativos: 0, avaliados: 0, enviados: 0, detalhes: [] as { id: string; score: number; status: string }[] };

  try {
    const gestaoUrl = Deno.env.get("GESTAO_API_URL");
    const gestaoToken = Deno.env.get("GESTAO_API_TOKEN");
    const megaUrl = Deno.env.get("MEGA_API_URL");
    const megaToken = Deno.env.get("MEGA_API_TOKEN");

    if (!gestaoUrl || !gestaoToken) {
      return new Response(JSON.stringify({ error: "GESTAO_API não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!megaUrl || !megaToken) {
      return new Response(JSON.stringify({ error: "MEGA_API não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar pacientes inativos
    console.log("[reativacao-score] Buscando pacientes inativos...");
    const gestaoRes = await fetch(gestaoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gestaoToken}` },
      body: JSON.stringify({ action: "list_inactive_patients", params: { months: 6, limit: 1000, offset: 0 } }),
    });

    if (!gestaoRes.ok) {
      console.error(`[reativacao-score] API Gestão erro ${gestaoRes.status}`);
      return new Response(JSON.stringify({ error: "Falha na API de Gestão", status: gestaoRes.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gestaoData = await gestaoRes.json();
    const pacientes: PacienteGestao[] = Array.isArray(gestaoData) ? gestaoData : gestaoData.data || gestaoData.patients || [];
    relatorio.total_inativos = pacientes.length;
    console.log(`[reativacao-score] ${pacientes.length} inativos encontrados`);

    if (pacientes.length === 0) {
      return new Response(JSON.stringify(relatorio), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Calcular score e ordenar
    const comScore = pacientes
      .filter((p) => p.phone && (!p.status || p.status.toLowerCase() !== "bloqueado"))
      .map((p) => ({ ...p, score: calcularScore(p) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    relatorio.avaliados = comScore.length;
    console.log(`[reativacao-score] ${comScore.length} pacientes selecionados (top ${TOP_N})`);

    // 3. Buscar reativações recentes para deduplicação
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_BLOQUEIO);

    const { data: recentes } = await supabase
      .from("automacoes")
      .select("paciente_externo_id")
      .eq("tipo", "reativacao_score")
      .gte("criado_em", dataLimite.toISOString());

    const jaEnviados = new Set((recentes || []).map((r) => r.paciente_externo_id));

    // 4. Processar cada paciente
    for (const pac of comScore) {
      const telefone = pac.phone.replace(/[^\d+]/g, "");
      const pacienteExternoId = `tel:${telefone}`;

      if (jaEnviados.has(pacienteExternoId)) {
        relatorio.detalhes.push({ id: pacienteExternoId, score: pac.score, status: "duplicado" });
        continue;
      }

      try {
        // Gerar mensagem
        const respostaRes = await fetch(`${SUPABASE_URL}/functions/v1/gerar-resposta-humanizada`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({
            paciente_externo_id: pacienteExternoId,
            intencao: "reativacao",
            estado: "inativo_score",
            acao: "encaminhar_retorno_inativo",
            dados: {
              nome_paciente: pac.name,
              tipo: "reativacao_score",
              especialidade: pac.especialidade ?? pac.specialty ?? "",
              score: pac.score,
              ultima_consulta: pac.last_appointment_date,
            },
          }),
        });

        let mensagem: string;
        if (respostaRes.ok) {
          mensagem = (await respostaRes.json()).resposta;
        } else {
          const nome = pac.name ? pac.name.split(" ")[0] : "";
          mensagem = `Olá${nome ? `, ${nome}` : ""}! Faz tempo que não nos vemos. Gostaríamos de convidá-lo(a) para uma consulta. Estamos à disposição! 😊`;
        }

        // Enviar via MegaAPI
        const megaRes = await fetch(megaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${megaToken}` },
          body: JSON.stringify({ number: telefone, text: mensagem }),
        });

        const enviado = megaRes.ok;

        // Registrar automação
        await supabase.from("automacoes").insert({
          paciente_externo_id: pacienteExternoId,
          tipo: "reativacao_score",
          sistema_alvo: "megaapi",
          status: enviado ? "enviado" : "erro_envio",
          data_execucao: new Date().toISOString(),
          payload: {
            nome: pac.name,
            telefone,
            score: pac.score,
            especialidade: pac.especialidade ?? pac.specialty ?? "",
            ultima_consulta: pac.last_appointment_date,
            mensagem_enviada: mensagem,
            mega_status: megaRes.status,
          },
        });

        // Registrar log
        await supabase.from("logs_decisao").insert({
          evento: "reativacao_score_v1",
          decisao: enviado ? "enviado" : "erro_envio",
          confianca: pac.score,
          regra_aplicada: `score=${pac.score}, top=${TOP_N}, bloqueio=${DIAS_BLOQUEIO}d`,
          dados_entrada: {
            paciente_externo_id: pacienteExternoId,
            nome: pac.name,
            score: pac.score,
            especialidade: pac.especialidade ?? pac.specialty,
            mega_status: megaRes.status,
          },
        });

        if (enviado) {
          relatorio.enviados++;
          relatorio.detalhes.push({ id: pacienteExternoId, score: pac.score, status: "enviado" });
          console.log(`[reativacao-score] ✓ ${pacienteExternoId} (score ${pac.score})`);
        } else {
          relatorio.detalhes.push({ id: pacienteExternoId, score: pac.score, status: "erro_envio" });
          console.error(`[reativacao-score] ✗ ${pacienteExternoId} MegaAPI ${megaRes.status}`);
        }
      } catch (err) {
        relatorio.detalhes.push({ id: pacienteExternoId, score: pac.score, status: "erro" });
        console.error(`[reativacao-score] Erro ${pacienteExternoId}:`, err);
      }
    }

    console.log(`[reativacao-score] Concluído: inativos=${relatorio.total_inativos} avaliados=${relatorio.avaliados} enviados=${relatorio.enviados}`);

    return new Response(JSON.stringify(relatorio), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[reativacao-score] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: "Erro interno", relatorio }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
