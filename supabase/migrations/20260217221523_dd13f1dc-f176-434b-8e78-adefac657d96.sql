
-- Create the update_updated_at function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabela de treinamento da IA
CREATE TABLE public.treinamento_ia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL DEFAULT 'geral',
  titulo TEXT NOT NULL,
  instrucao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  canal TEXT NOT NULL DEFAULT 'ambos',
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.treinamento_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage training" ON public.treinamento_ia
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Supervisao can view training" ON public.treinamento_ia
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisao'))
  );

CREATE TRIGGER update_treinamento_ia_updated_at
  BEFORE UPDATE ON public.treinamento_ia
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
