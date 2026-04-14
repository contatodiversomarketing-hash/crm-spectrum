
CREATE TABLE IF NOT EXISTS public.locks_processamento (
  numero TEXT PRIMARY KEY,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.limpar_locks_antigos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.locks_processamento WHERE criado_em < now() - interval '60 seconds';
$$;

ALTER TABLE public.locks_processamento ENABLE ROW LEVEL SECURITY;
