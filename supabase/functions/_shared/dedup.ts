// Deduplicação única de leads e pacientes por telefone (+ CPF quando houver).
// Regra: 1 pessoa = 1 lead no CRM e 1 cadastro em pacientes.

type Supa = any;

/** Só dígitos, sem DDI 55 e sem zeros à esquerda. Ex.: +55 (11) 99999-9999 -> 11999999999 */
export function telBase(telefone?: string | null): string {
  let d = (telefone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d;
}

/** Forma canônica usada para gravar: 55 + DDD + número */
export function telCanonico(telefone?: string | null): string {
  const base = telBase(telefone);
  return base ? `55${base}` : "";
}

/** Todas as variações usadas em buscas (histórico gravado em formatos diferentes) */
export function telVariacoes(telefone?: string | null): string[] {
  const base = telBase(telefone);
  if (!base) return [];
  const semNove = base.length === 11 && base[2] === "9" ? base.slice(0, 2) + base.slice(3) : "";
  const comNove = base.length === 10 ? base.slice(0, 2) + "9" + base.slice(2) : "";
  const raizes = [base, semNove, comNove].filter(Boolean);
  const out = new Set<string>();
  for (const r of raizes) {
    out.add(r);
    out.add(`55${r}`);
    out.add(`+55${r}`);
    out.add(`+${r}`);
  }
  return Array.from(out);
}

export function cpfLimpo(cpf?: string | null): string {
  const d = (cpf || "").replace(/\D/g, "");
  return d.length === 11 ? d : "";
}

/** Procura o lead existente da pessoa (CPF primeiro, depois qualquer variação de telefone). */
export async function buscarLead(
  supabase: Supa,
  telefone?: string | null,
  cpf?: string | null,
  colunas = "id, nome, observacoes, telefone, cpf",
): Promise<any | null> {
  const doc = cpfLimpo(cpf);
  if (doc) {
    const { data } = await supabase
      .from("leads").select(colunas).eq("cpf", doc)
      .order("criado_em", { ascending: true }).limit(1);
    if (data?.[0]) return data[0];
  }
  const vars = telVariacoes(telefone);
  if (vars.length) {
    const { data } = await supabase
      .from("leads").select(colunas).in("telefone", vars)
      .order("criado_em", { ascending: true }).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

/** Procura o paciente existente (CPF, telefone ou externo_id em qualquer formato). */
export async function buscarPaciente(
  supabase: Supa,
  telefone?: string | null,
  cpf?: string | null,
): Promise<any | null> {
  const doc = cpfLimpo(cpf);
  if (doc) {
    const { data } = await supabase
      .from("pacientes").select("id, nome, telefone, cpf").eq("cpf", doc)
      .order("criado_em", { ascending: true }).limit(1);
    if (data?.[0]) return data[0];
  }
  const vars = telVariacoes(telefone);
  if (vars.length) {
    const ids = vars.flatMap((v) => [v, `tel:${v}`]);
    const { data } = await supabase
      .from("pacientes").select("id, nome, telefone, cpf")
      .or(`telefone.in.(${ids.join(",")}),externo_id.in.(${ids.join(",")})`)
      .order("criado_em", { ascending: true }).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

/** Cria ou atualiza o paciente único da pessoa. Nunca duplica. */
export async function upsertPaciente(
  supabase: Supa,
  dados: { nome?: string | null; telefone?: string | null; cpf?: string | null; email?: string | null; data_nascimento?: string | null; tipo?: string },
): Promise<string | null> {
  const tel = telCanonico(dados.telefone);
  const doc = cpfLimpo(dados.cpf);
  const existente = await buscarPaciente(supabase, dados.telefone, doc);

  const payload: Record<string, unknown> = {
    externo_id: tel || doc || crypto.randomUUID(),
    ...(dados.nome ? { nome: dados.nome.trim().replace(/\s+/g, " ") } : {}),
    ...(tel ? { telefone: tel } : {}),
    ...(doc ? { cpf: doc } : {}),
    ...(dados.email ? { email: dados.email } : {}),
    ...(dados.data_nascimento ? { data_nascimento: dados.data_nascimento } : {}),
    tipo: dados.tipo || "adulto",
  };

  if (existente?.id) {
    delete (payload as any).externo_id;
    await supabase.from("pacientes").update(payload).eq("id", existente.id);
    return existente.id;
  }
  const { data } = await supabase.from("pacientes").insert(payload).select("id").maybeSingle();
  return data?.id ?? null;
}
