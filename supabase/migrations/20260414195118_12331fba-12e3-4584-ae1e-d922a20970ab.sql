
-- Create pipelines table
CREATE TABLE public.pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pipelines" ON public.pipelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pipelines" ON public.pipelines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pipelines" ON public.pipelines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete pipelines" ON public.pipelines FOR DELETE TO authenticated USING (true);

-- Insert default pipeline
INSERT INTO public.pipelines (id, nome) VALUES ('00000000-0000-0000-0000-000000000001', 'Pacientes');

-- Add pipeline_id to pipeline_colunas
ALTER TABLE public.pipeline_colunas ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001';

-- Update existing columns to belong to default pipeline
UPDATE public.pipeline_colunas SET pipeline_id = '00000000-0000-0000-0000-000000000001' WHERE pipeline_id IS NULL;

ALTER TABLE public.pipeline_colunas ALTER COLUMN pipeline_id SET NOT NULL;

-- Add pipeline_id to leads
ALTER TABLE public.leads ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Update existing leads
UPDATE public.leads SET pipeline_id = '00000000-0000-0000-0000-000000000001' WHERE pipeline_id IS NULL;
