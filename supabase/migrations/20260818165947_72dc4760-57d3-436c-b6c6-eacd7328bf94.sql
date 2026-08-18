ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS paciente_nome text,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'Consulta',
  ADD COLUMN IF NOT EXISTS procedimento text,
  ADD COLUMN IF NOT EXISTS duracao_min integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sala text,
  ADD COLUMN IF NOT EXISTS profissional text,
  ADD COLUMN IF NOT EXISTS observacoes text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;

DROP POLICY IF EXISTS "Authenticated manage agendamentos" ON public.agendamentos;
CREATE POLICY "Authenticated manage agendamentos"
ON public.agendamentos FOR ALL TO authenticated
USING (true) WITH CHECK (true);