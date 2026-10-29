CREATE TABLE public.neuroacesso_ia_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id uuid,
  resposta_id uuid,
  autor_id uuid,
  status text NOT NULL DEFAULT 'pesquisando',
  etapa text NOT NULL DEFAULT 'Preparando análise…',
  pesquisa text NOT NULL DEFAULT '',
  parcial text NOT NULL DEFAULT '',
  hops integer NOT NULL DEFAULT 0,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.neuroacesso_ia_jobs TO authenticated;
GRANT ALL ON public.neuroacesso_ia_jobs TO service_role;
ALTER TABLE public.neuroacesso_ia_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem jobs analise" ON public.neuroacesso_ia_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'supervisao'::app_role));
CREATE INDEX neuroacesso_ia_jobs_criado_idx ON public.neuroacesso_ia_jobs (criado_em DESC);