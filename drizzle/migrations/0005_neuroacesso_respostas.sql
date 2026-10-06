CREATE TABLE public.neuroacesso_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionario text NOT NULL DEFAULT 'mentorada',
  nome text NOT NULL,
  email text,
  telefone text,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  lido boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.neuroacesso_respostas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neuroacesso_respostas TO authenticated;
GRANT ALL ON public.neuroacesso_respostas TO service_role;
ALTER TABLE public.neuroacesso_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer pessoa envia resposta" ON public.neuroacesso_respostas FOR INSERT TO anon, authenticated
  WITH CHECK (length(nome) BETWEEN 2 AND 200 AND lido = false);
CREATE POLICY "Admins leem respostas" ON public.neuroacesso_respostas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao'));
CREATE POLICY "Admins atualizam respostas" ON public.neuroacesso_respostas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao'));
CREATE POLICY "Admins apagam respostas" ON public.neuroacesso_respostas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Envio de anexos NeuroAcesso" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'neuroacesso' AND (storage.foldername(name))[1] = 'respostas');
CREATE POLICY "Admins leem anexos NeuroAcesso" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'neuroacesso' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao')));