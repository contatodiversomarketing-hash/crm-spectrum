CREATE TABLE public.relatorio_executivo_ia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resumo TEXT NOT NULL,
  prioridade_principal TEXT NOT NULL,
  impacto_estimado TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.relatorio_executivo_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read relatorios"
ON public.relatorio_executivo_ia
FOR SELECT
USING (true);

CREATE POLICY "Authenticated can insert relatorios"
ON public.relatorio_executivo_ia
FOR INSERT
WITH CHECK (true);