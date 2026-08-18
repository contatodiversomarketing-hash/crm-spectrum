ALTER TABLE public.pacientes
  ALTER COLUMN externo_id SET DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'adulto',
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf text,
  ADD COLUMN IF NOT EXISTS responsavel_data_nascimento date,
  ADD COLUMN IF NOT EXISTS responsavel_telefone text,
  ADD COLUMN IF NOT EXISTS responsavel_email text,
  ADD COLUMN IF NOT EXISTS responsavel_parentesco text,
  ADD COLUMN IF NOT EXISTS responsavel_endereco_mesmo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS responsavel_cep text,
  ADD COLUMN IF NOT EXISTS responsavel_logradouro text,
  ADD COLUMN IF NOT EXISTS responsavel_numero text,
  ADD COLUMN IF NOT EXISTS responsavel_complemento text,
  ADD COLUMN IF NOT EXISTS responsavel_bairro text,
  ADD COLUMN IF NOT EXISTS responsavel_cidade text,
  ADD COLUMN IF NOT EXISTS responsavel_estado text,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated;
GRANT ALL ON public.pacientes TO service_role;

DROP POLICY IF EXISTS "Authenticated manage pacientes" ON public.pacientes;
CREATE POLICY "Authenticated manage pacientes" ON public.pacientes
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_pacientes_updated ON public.pacientes;
CREATE TRIGGER trg_pacientes_updated BEFORE UPDATE ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.prontuario_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'texto',
  titulo text,
  conteudo text NOT NULL DEFAULT '',
  audio_path text,
  autor_id uuid,
  autor_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prontuario_registros TO authenticated;
GRANT ALL ON public.prontuario_registros TO service_role;
ALTER TABLE public.prontuario_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage prontuario" ON public.prontuario_registros;
CREATE POLICY "Authenticated manage prontuario" ON public.prontuario_registros
FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_prontuario_updated ON public.prontuario_registros;
CREATE TRIGGER trg_prontuario_updated BEFORE UPDATE ON public.prontuario_registros
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.prontuario_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  registro_id uuid REFERENCES public.prontuario_registros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  path text NOT NULL,
  mime text,
  tamanho integer,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prontuario_anexos TO authenticated;
GRANT ALL ON public.prontuario_anexos TO service_role;
ALTER TABLE public.prontuario_anexos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage anexos" ON public.prontuario_anexos;
CREATE POLICY "Authenticated manage anexos" ON public.prontuario_anexos
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  forma_pagamento text,
  pago boolean NOT NULL DEFAULT false,
  vencimento date,
  data_pagamento date,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_lancamentos TO authenticated;
GRANT ALL ON public.financeiro_lancamentos TO service_role;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated manage financeiro" ON public.financeiro_lancamentos;
CREATE POLICY "Authenticated manage financeiro" ON public.financeiro_lancamentos
FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_financeiro_updated ON public.financeiro_lancamentos;
CREATE TRIGGER trg_financeiro_updated BEFORE UPDATE ON public.financeiro_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Authenticated read prontuarios" ON storage.objects;
CREATE POLICY "Authenticated read prontuarios" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'prontuarios');
DROP POLICY IF EXISTS "Authenticated write prontuarios" ON storage.objects;
CREATE POLICY "Authenticated write prontuarios" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'prontuarios');
DROP POLICY IF EXISTS "Authenticated update prontuarios" ON storage.objects;
CREATE POLICY "Authenticated update prontuarios" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'prontuarios');
DROP POLICY IF EXISTS "Authenticated delete prontuarios" ON storage.objects;
CREATE POLICY "Authenticated delete prontuarios" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'prontuarios');