
-- Tabela de avaliações individuais de ligações
CREATE TABLE public.avaliacao_ligacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES public.clinicas(id),
  vendedora_id UUID REFERENCES public.vendedoras(id),
  transcricao_ligacao_id UUID REFERENCES public.transcricoes_ligacoes(id),
  transcricao_texto TEXT NOT NULL,
  resultado_venda BOOLEAN NOT NULL DEFAULT false,
  nota_abertura NUMERIC NOT NULL DEFAULT 0,
  nota_rapport NUMERIC NOT NULL DEFAULT 0,
  nota_escuta_ativa NUMERIC NOT NULL DEFAULT 0,
  nota_identificacao_dor NUMERIC NOT NULL DEFAULT 0,
  nota_gatilhos NUMERIC NOT NULL DEFAULT 0,
  nota_objecao_apa NUMERIC NOT NULL DEFAULT 0,
  nota_fechamento NUMERIC NOT NULL DEFAULT 0,
  nota_seguranca_emocional NUMERIC NOT NULL DEFAULT 0,
  nota_geral NUMERIC NOT NULL DEFAULT 0,
  pontos_fortes TEXT[] DEFAULT '{}',
  erros_detectados TEXT[] DEFAULT '{}',
  tecnica_recomendada TEXT,
  sugestao_pratica TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.avaliacao_ligacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read avaliacao_ligacoes" ON public.avaliacao_ligacoes FOR SELECT USING (true);
CREATE POLICY "Service role full access avaliacao_ligacoes" ON public.avaliacao_ligacoes FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_avaliacao_ligacoes_clinica ON public.avaliacao_ligacoes(clinica_id);
CREATE INDEX idx_avaliacao_ligacoes_vendedora ON public.avaliacao_ligacoes(vendedora_id);

-- Tabela de desempenho agregado por vendedora
CREATE TABLE public.desempenho_vendedoras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES public.clinicas(id),
  vendedora_id UUID NOT NULL REFERENCES public.vendedoras(id),
  total_ligacoes_avaliadas INTEGER NOT NULL DEFAULT 0,
  media_abertura NUMERIC NOT NULL DEFAULT 0,
  media_rapport NUMERIC NOT NULL DEFAULT 0,
  media_escuta_ativa NUMERIC NOT NULL DEFAULT 0,
  media_identificacao_dor NUMERIC NOT NULL DEFAULT 0,
  media_gatilhos NUMERIC NOT NULL DEFAULT 0,
  media_objecao_apa NUMERIC NOT NULL DEFAULT 0,
  media_fechamento NUMERIC NOT NULL DEFAULT 0,
  media_seguranca_emocional NUMERIC NOT NULL DEFAULT 0,
  media_geral NUMERIC NOT NULL DEFAULT 0,
  taxa_conversao NUMERIC NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vendedora_id)
);

ALTER TABLE public.desempenho_vendedoras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read desempenho_vendedoras" ON public.desempenho_vendedoras FOR SELECT USING (true);
CREATE POLICY "Service role full access desempenho_vendedoras" ON public.desempenho_vendedoras FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_desempenho_vendedoras_clinica ON public.desempenho_vendedoras(clinica_id);
