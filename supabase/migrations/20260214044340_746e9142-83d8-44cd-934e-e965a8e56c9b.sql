
-- Tabela: configuracoes_sistema
CREATE TABLE public.configuracoes_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modo_supervisao_ativo BOOLEAN NOT NULL DEFAULT true,
  horario_inicio TIME NOT NULL DEFAULT '08:00:00',
  horario_fim TIME NOT NULL DEFAULT '18:00:00',
  dias_semana TEXT NOT NULL DEFAULT 'seg,ter,qua,qui,sex',
  nivel_autonomia INTEGER NOT NULL DEFAULT 50 CHECK (nivel_autonomia >= 0 AND nivel_autonomia <= 100),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read configuracoes" ON public.configuracoes_sistema
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert configuracoes" ON public.configuracoes_sistema
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update configuracoes" ON public.configuracoes_sistema
  FOR UPDATE TO authenticated USING (true);

-- Tabela: interacoes_ia
CREATE TABLE public.interacoes_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_externo_id TEXT NOT NULL,
  sistema_origem TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'telefone')),
  mensagem_usuario TEXT,
  intencao_detectada TEXT,
  estado_conversa TEXT,
  resposta_sugerida TEXT,
  resposta_final TEXT,
  supervisionado BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.interacoes_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read interacoes" ON public.interacoes_ia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert interacoes" ON public.interacoes_ia
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update interacoes" ON public.interacoes_ia
  FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_interacoes_paciente ON public.interacoes_ia (paciente_externo_id);
CREATE INDEX idx_interacoes_criado_em ON public.interacoes_ia (criado_em);

-- Tabela: memorias_ia
CREATE TABLE public.memorias_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_externo_id TEXT NOT NULL,
  resumo_contextual TEXT,
  risco_classificacao TEXT,
  preferencia_profissional TEXT,
  ultima_interacao TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.memorias_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read memorias" ON public.memorias_ia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert memorias" ON public.memorias_ia
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update memorias" ON public.memorias_ia
  FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_memorias_paciente ON public.memorias_ia (paciente_externo_id);

-- Tabela: logs_decisao
CREATE TABLE public.logs_decisao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento TEXT NOT NULL,
  dados_entrada JSONB,
  regra_aplicada TEXT,
  decisao TEXT,
  confianca NUMERIC,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.logs_decisao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read logs" ON public.logs_decisao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert logs" ON public.logs_decisao
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_logs_criado_em ON public.logs_decisao (criado_em);

-- Tabela: automacoes
CREATE TABLE public.automacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_externo_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  sistema_alvo TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pendente',
  data_execucao TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read automacoes" ON public.automacoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert automacoes" ON public.automacoes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update automacoes" ON public.automacoes
  FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_automacoes_paciente ON public.automacoes (paciente_externo_id);
CREATE INDEX idx_automacoes_criado_em ON public.automacoes (criado_em);
