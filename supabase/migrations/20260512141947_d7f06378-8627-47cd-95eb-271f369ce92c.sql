ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_etapa integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_ultimo_envio timestamptz,
  ADD COLUMN IF NOT EXISTS followup_finalizado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_followup ON public.leads (followup_finalizado, followup_etapa, criado_em);