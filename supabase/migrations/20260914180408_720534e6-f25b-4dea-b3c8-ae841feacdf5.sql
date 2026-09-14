ALTER TABLE public.interacoes_ia
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_status text,
  ADD COLUMN IF NOT EXISTS whatsapp_erro text;

CREATE INDEX IF NOT EXISTS idx_interacoes_ia_whatsapp_message_id
  ON public.interacoes_ia (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;