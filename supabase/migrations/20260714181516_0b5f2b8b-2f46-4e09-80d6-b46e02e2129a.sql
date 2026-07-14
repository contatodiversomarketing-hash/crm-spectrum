
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS nome_filho text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS documentos jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.lead_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  lembrar_em timestamptz NOT NULL,
  concluido boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_alertas TO authenticated;
GRANT ALL ON public.lead_alertas TO service_role;

ALTER TABLE public.lead_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage lead_alertas"
ON public.lead_alertas FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lead_alertas_lead ON public.lead_alertas(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_alertas_lembrar ON public.lead_alertas(lembrar_em) WHERE concluido = false;

CREATE TRIGGER trg_lead_alertas_updated
BEFORE UPDATE ON public.lead_alertas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
