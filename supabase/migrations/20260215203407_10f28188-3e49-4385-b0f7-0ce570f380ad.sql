
-- Criar tabela insights_ia para armazenar sugestões estratégicas geradas pela IA
CREATE TABLE public.insights_ia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  impacto_estimado TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.insights_ia ENABLE ROW LEVEL SECURITY;

-- Política de leitura para usuários autenticados
CREATE POLICY "Authenticated can read insights"
  ON public.insights_ia
  FOR SELECT
  USING (true);

-- Política de inserção para usuários autenticados (edge functions usam service role)
CREATE POLICY "Authenticated can insert insights"
  ON public.insights_ia
  FOR INSERT
  WITH CHECK (true);
