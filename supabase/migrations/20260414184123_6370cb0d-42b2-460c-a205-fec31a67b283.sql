
-- Expandir tabela leads para CRM interno
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS dados_triagem JSONB,
ADD COLUMN IF NOT EXISTS status_pipeline TEXT NOT NULL DEFAULT 'novo',
ADD COLUMN IF NOT EXISTS observacoes TEXT,
ADD COLUMN IF NOT EXISTS medico_preferido TEXT,
ADD COLUMN IF NOT EXISTS ultima_interacao TIMESTAMPTZ;

-- Tabela de relatórios de triagem recebidos do site vitta-care.com
CREATE TABLE IF NOT EXISTS public.relatorios_triagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  cpf TEXT,
  objetivo TEXT,
  sintomas TEXT,
  historico_saude TEXT,
  medicamentos_atuais TEXT,
  dados_completos JSONB,
  status TEXT NOT NULL DEFAULT 'pendente',
  processado BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.relatorios_triagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read relatorios_triagem"
ON public.relatorios_triagem FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Service role full access relatorios_triagem"
ON public.relatorios_triagem FOR ALL
TO public USING (true) WITH CHECK (true);

-- Tabela de médicos parceiros
CREATE TABLE IF NOT EXISTS public.medicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  especialidade TEXT NOT NULL DEFAULT 'Psiquiatria',
  crm TEXT,
  dias_atendimento TEXT,
  horario_inicio TIME DEFAULT '08:00',
  horario_fim TIME DEFAULT '18:00',
  valor_consulta NUMERIC,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read medicos"
ON public.medicos FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admin can manage medicos"
ON public.medicos FOR ALL
TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Índices
CREATE INDEX IF NOT EXISTS idx_leads_status_pipeline ON public.leads(status_pipeline);
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON public.leads(telefone);
CREATE INDEX IF NOT EXISTS idx_relatorios_triagem_status ON public.relatorios_triagem(status);
CREATE INDEX IF NOT EXISTS idx_relatorios_triagem_telefone ON public.relatorios_triagem(telefone);
