CREATE TABLE public.neuroacesso_ia_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  conteudo text NOT NULL,
  resposta_id uuid REFERENCES public.neuroacesso_respostas(id) ON DELETE SET NULL,
  ensinamento boolean NOT NULL DEFAULT false,
  autor_id uuid,
  autor_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.neuroacesso_ia_mensagens TO authenticated;
GRANT ALL ON public.neuroacesso_ia_mensagens TO service_role;
ALTER TABLE public.neuroacesso_ia_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins leem chat analise" ON public.neuroacesso_ia_mensagens FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisao'));
CREATE POLICY "Admins apagam chat analise" ON public.neuroacesso_ia_mensagens FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE INDEX ON public.neuroacesso_ia_mensagens (criado_em);