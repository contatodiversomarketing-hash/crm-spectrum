ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS nao_lidas integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ultima_msg_recebida_em timestamptz;