ALTER TABLE public.leads ADD COLUMN reuniao_em timestamptz;
CREATE TABLE public.crm_etiquetas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 60), cor text NOT NULL DEFAULT 'primary' CHECK (cor IN ('primary','secondary','accent','muted')), criado_em timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX crm_etiquetas_nome_unique ON public.crm_etiquetas (lower(trim(nome)));
GRANT SELECT, INSERT ON public.crm_etiquetas TO authenticated;
GRANT ALL ON public.crm_etiquetas TO service_role;
ALTER TABLE public.crm_etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads labels" ON public.crm_etiquetas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team creates labels" ON public.crm_etiquetas FOR INSERT TO authenticated WITH CHECK (true);