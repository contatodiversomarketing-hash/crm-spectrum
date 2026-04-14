
CREATE OR REPLACE FUNCTION public.mover_lead_consultou_para_vendas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_pacientes_id uuid;
  v_pipeline_vendas_id uuid;
BEGIN
  -- Only act when status_pipeline changes to 'consultou'
  IF NEW.status_pipeline = 'consultou' AND (OLD.status_pipeline IS DISTINCT FROM 'consultou') THEN
    -- Get Pacientes pipeline id
    SELECT id INTO v_pipeline_pacientes_id FROM public.pipelines WHERE nome = 'Pacientes' LIMIT 1;
    
    -- Only proceed if the lead is in the Pacientes pipeline
    IF NEW.pipeline_id = v_pipeline_pacientes_id THEN
      -- Get Vendas pipeline id
      SELECT id INTO v_pipeline_vendas_id FROM public.pipelines WHERE nome = 'Vendas' LIMIT 1;
      
      IF v_pipeline_vendas_id IS NOT NULL THEN
        NEW.pipeline_id := v_pipeline_vendas_id;
        NEW.status_pipeline := 'novo';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_mover_consultou_vendas
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.mover_lead_consultou_para_vendas();
