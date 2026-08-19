ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_leads_etiquetas ON public.leads USING GIN (etiquetas);