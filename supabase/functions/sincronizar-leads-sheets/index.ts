import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SPREADSHEET_ID = "1VKWFBal8fNBJmLvVpTBkEAP-nHGaTm3oUEfcaMj_n5M";
const ABAS = ["QUIZ", "NEUROACESSO", "BLOG"];

function normalizarTelefone(v: string): string {
  const d = (v || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  return `55${d}`;
}

// "22/07/2026 12:05:44" -> ISO
function parseDataHora(v: string): string | null {
  const m = (v || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  // horário de São Paulo (UTC-3)
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss || "00"}-03:00`).toISOString();
}

function linhasParaObjetos(values: string[][]) {
  if (!values || values.length < 2) return [];
  const header = values[0].map((h) => (h || "").trim().toLowerCase());
  return values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h) obj[h] = (row[i] ?? "").toString().trim();
    });
    return obj;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_SHEETS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Conexão com Google Sheets não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rangesQS = ABAS.map((a) => `ranges=${a}!A1:Z2000`).join("&");
    const resp = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${rangesQS}&valueRenderOption=FORMATTED_VALUE`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
        },
      },
    );

    if (!resp.ok) {
      const details = await resp.text();
      console.error(`Google Sheets falhou [${resp.status}]: ${details}`);
      return new Response(
        JSON.stringify({ error: "Falha ao ler a planilha", status: resp.status, details }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const valueRanges: Array<{ range: string; values?: string[][] }> = data.valueRanges || [];

    // Destino padrão no CRM: primeira pipeline + primeira coluna
    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id")
      .order("criado_em", { ascending: true })
      .limit(1)
      .maybeSingle();

    let statusPipeline = "novo";
    if (pipeline?.id) {
      const { data: coluna } = await supabase
        .from("pipeline_colunas")
        .select("chave")
        .eq("pipeline_id", pipeline.id)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (coluna?.chave) statusPipeline = coluna.chave;
    }

    const novos: any[] = [];
    const chaves: string[] = [];

    valueRanges.forEach((vr, idx) => {
      const aba = ABAS[idx] ?? (vr.range || "").split("!")[0];
      for (const row of linhasParaObjetos(vr.values || [])) {
        const datahora = row["data/hora"] || "";
        const telefone = normalizarTelefone(row["whatsapp"] || row["telefone"] || "");
        const nome = row["nome"] || "";
        if (!telefone && !nome) continue;

        const chave = `sheets:${aba}:${datahora}:${telefone || nome}`;
        if (chaves.includes(chave)) continue;
        chaves.push(chave);

        const quiz = row["quiz"] || row["origem"] || aba.toLowerCase();
        let respostas: unknown = row["respostas"] || null;
        try {
          if (typeof respostas === "string" && respostas.startsWith("[")) respostas = JSON.parse(respostas);
        } catch (_) { /* mantém texto */ }

        novos.push({
          origem_externa_id: chave,
          nome: nome || null,
          telefone: telefone || null,
          email: row["e-mail"] || row["email"] || null,
          origem: `planilha_${aba.toLowerCase()}`,
          status: "novo",
          status_pipeline: statusPipeline,
          pipeline_id: pipeline?.id ?? null,
          nome_filho: row["paciente/criança"] || null,
          criado_em: parseDataHora(datahora) || new Date().toISOString(),
          dados_triagem: {
            aba,
            quiz,
            idade: row["idade"] || null,
            especialidade: row["especialidade"] || null,
            resultado: row["resultado"] || null,
            respostas,
            data_hora_planilha: datahora,
          },
        });
      }
    });

    if (novos.length === 0) {
      return new Response(JSON.stringify({ lidos: 0, importados: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só insere o que ainda não existe (origem_externa_id é único)
    const { data: existentes, error: errExist } = await supabase
      .from("leads")
      .select("origem_externa_id")
      .in("origem_externa_id", chaves);
    if (errExist) throw errExist;

    const jaImportados = new Set((existentes || []).map((e: any) => e.origem_externa_id));
    const paraInserir = novos.filter((l) => !jaImportados.has(l.origem_externa_id));

    let importados = 0;
    for (let i = 0; i < paraInserir.length; i += 200) {
      const lote = paraInserir.slice(i, i + 200);
      const { error } = await supabase.from("leads").insert(lote);
      if (error) {
        console.error("Erro ao inserir lote de leads:", error.message);
        throw error;
      }
      importados += lote.length;
    }

    console.log(`Sincronização Sheets: ${novos.length} linhas, ${importados} novos leads`);

    return new Response(JSON.stringify({ lidos: novos.length, importados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro na sincronização:", err);
    return new Response(JSON.stringify({ error: "Erro interno", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
