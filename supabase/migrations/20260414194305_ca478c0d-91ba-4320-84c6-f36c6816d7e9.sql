
CREATE TABLE public.pipeline_colunas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT 'bg-blue-500',
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_colunas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pipeline_colunas" ON public.pipeline_colunas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pipeline_colunas" ON public.pipeline_colunas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pipeline_colunas" ON public.pipeline_colunas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete pipeline_colunas" ON public.pipeline_colunas FOR DELETE TO authenticated USING (true);

INSERT INTO public.pipeline_colunas (chave, nome, cor, ordem) VALUES
  ('novo', 'Novo', 'bg-blue-500', 0),
  ('triagem_recebida', 'Triagem Recebida', 'bg-purple-500', 1),
  ('em_contato', 'Em Contato', 'bg-yellow-500', 2),
  ('agendado', 'Agendado', 'bg-green-500', 3),
  ('consultou', 'Consultou', 'bg-emerald-600', 4),
  ('perdido', 'Perdido', 'bg-red-500', 5);
