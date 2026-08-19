ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS valor_total numeric NOT NULL DEFAULT 550,
  ADD COLUMN IF NOT EXISTS sinal_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sinal_valor numeric,
  ADD COLUMN IF NOT EXISTS sinal_pago_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS restante_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restante_valor numeric,
  ADD COLUMN IF NOT EXISTS restante_pago_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS lembrete_sinal_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS lembrete_restante_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS aviso_bloqueio_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS bloqueado_por_pagamento boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agendamentos_data_hora_pagamento
  ON public.agendamentos (data_hora)
  WHERE restante_pago = false;