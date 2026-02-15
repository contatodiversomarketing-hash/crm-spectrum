
-- 1. Enum de planos
CREATE TYPE public.plano_clinica AS ENUM ('growth', 'performance', 'elite');

-- 2. Tabela clinicas
CREATE TABLE public.clinicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  plano plano_clinica NOT NULL DEFAULT 'growth',
  limite_whatsapp INTEGER NOT NULL DEFAULT 500,
  limite_ligacoes INTEGER NOT NULL DEFAULT 100,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access clinicas" ON public.clinicas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read clinicas" ON public.clinicas FOR SELECT TO authenticated USING (true);

-- 3. Tabela uso_mensal_clinica
CREATE TABLE public.uso_mensal_clinica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id),
  mes_referencia TEXT NOT NULL,
  mensagens_whatsapp_usadas INTEGER NOT NULL DEFAULT 0,
  ligacoes_realizadas INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(clinica_id, mes_referencia)
);
ALTER TABLE public.uso_mensal_clinica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access uso_mensal" ON public.uso_mensal_clinica FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read uso_mensal" ON public.uso_mensal_clinica FOR SELECT TO authenticated USING (true);

-- 4. Tabela pacientes
CREATE TABLE public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  externo_id TEXT NOT NULL,
  nome TEXT,
  telefone TEXT,
  email TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read pacientes" ON public.pacientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access pacientes" ON public.pacientes FOR ALL USING (true) WITH CHECK (true);

-- 5. Tabela vendedoras
CREATE TABLE public.vendedoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.vendedoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vendedoras" ON public.vendedoras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access vendedoras" ON public.vendedoras FOR ALL USING (true) WITH CHECK (true);

-- 6. Tabela leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  nome TEXT,
  telefone TEXT,
  origem TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);

-- 7. Tabela agendamentos
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  paciente_id UUID REFERENCES public.pacientes(id),
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read agendamentos" ON public.agendamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access agendamentos" ON public.agendamentos FOR ALL USING (true) WITH CHECK (true);

-- 8. Tabela score_reativacao
CREATE TABLE public.score_reativacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  paciente_externo_id TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  fatores JSONB,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.score_reativacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read score_reativacao" ON public.score_reativacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access score_reativacao" ON public.score_reativacao FOR ALL USING (true) WITH CHECK (true);

-- 9. Tabela transcricoes_ligacoes
CREATE TABLE public.transcricoes_ligacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  call_sid TEXT,
  paciente_externo_id TEXT,
  transcricao TEXT,
  resultado TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.transcricoes_ligacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read transcricoes" ON public.transcricoes_ligacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access transcricoes" ON public.transcricoes_ligacoes FOR ALL USING (true) WITH CHECK (true);

-- 10. Tabela previsao_demanda
CREATE TABLE public.previsao_demanda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  periodo TEXT NOT NULL,
  previsao JSONB,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.previsao_demanda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read previsao_demanda" ON public.previsao_demanda FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access previsao_demanda" ON public.previsao_demanda FOR ALL USING (true) WITH CHECK (true);

-- 11. Tabela precificacao_ia
CREATE TABLE public.precificacao_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  procedimento TEXT NOT NULL,
  preco_atual NUMERIC,
  preco_sugerido NUMERIC,
  justificativa TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.precificacao_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read precificacao" ON public.precificacao_ia FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access precificacao" ON public.precificacao_ia FOR ALL USING (true) WITH CHECK (true);

-- 12. Tabela analise_contratacao
CREATE TABLE public.analise_contratacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  cargo TEXT NOT NULL,
  recomendacao TEXT,
  dados JSONB,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.analise_contratacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read analise_contratacao" ON public.analise_contratacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access analise_contratacao" ON public.analise_contratacao FOR ALL USING (true) WITH CHECK (true);

-- 13. Tabela analise_rentabilidade
CREATE TABLE public.analise_rentabilidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id),
  procedimento TEXT NOT NULL,
  receita NUMERIC,
  custo NUMERIC,
  margem NUMERIC,
  recomendacao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.analise_rentabilidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read analise_rentabilidade" ON public.analise_rentabilidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access analise_rentabilidade" ON public.analise_rentabilidade FOR ALL USING (true) WITH CHECK (true);

-- 14. Adicionar clinica_id nas tabelas existentes (nullable para retrocompatibilidade)
ALTER TABLE public.insights_ia ADD COLUMN clinica_id UUID REFERENCES public.clinicas(id);
ALTER TABLE public.relatorio_executivo_ia ADD COLUMN clinica_id UUID REFERENCES public.clinicas(id);
ALTER TABLE public.interacoes_ia ADD COLUMN clinica_id UUID REFERENCES public.clinicas(id);
ALTER TABLE public.automacoes ADD COLUMN clinica_id UUID REFERENCES public.clinicas(id);
ALTER TABLE public.memorias_ia ADD COLUMN clinica_id UUID REFERENCES public.clinicas(id);
ALTER TABLE public.logs_decisao ADD COLUMN clinica_id UUID REFERENCES public.clinicas(id);

-- 15. Índices para performance multi-tenant
CREATE INDEX idx_pacientes_clinica ON public.pacientes(clinica_id);
CREATE INDEX idx_leads_clinica ON public.leads(clinica_id);
CREATE INDEX idx_agendamentos_clinica ON public.agendamentos(clinica_id);
CREATE INDEX idx_interacoes_ia_clinica ON public.interacoes_ia(clinica_id);
CREATE INDEX idx_automacoes_clinica ON public.automacoes(clinica_id);
CREATE INDEX idx_insights_ia_clinica ON public.insights_ia(clinica_id);
CREATE INDEX idx_memorias_ia_clinica ON public.memorias_ia(clinica_id);
CREATE INDEX idx_logs_decisao_clinica ON public.logs_decisao(clinica_id);
CREATE INDEX idx_score_reativacao_clinica ON public.score_reativacao(clinica_id);
CREATE INDEX idx_transcricoes_clinica ON public.transcricoes_ligacoes(clinica_id);
CREATE INDEX idx_vendedoras_clinica ON public.vendedoras(clinica_id);
CREATE INDEX idx_previsao_demanda_clinica ON public.previsao_demanda(clinica_id);
CREATE INDEX idx_precificacao_clinica ON public.precificacao_ia(clinica_id);
CREATE INDEX idx_analise_contratacao_clinica ON public.analise_contratacao(clinica_id);
CREATE INDEX idx_analise_rentabilidade_clinica ON public.analise_rentabilidade(clinica_id);
CREATE INDEX idx_uso_mensal_clinica ON public.uso_mensal_clinica(clinica_id);
