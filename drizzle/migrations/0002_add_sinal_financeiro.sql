ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS tem_sinal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sinal_valor numeric,
  ADD COLUMN IF NOT EXISTS sinal_forma text,
  ADD COLUMN IF NOT EXISTS sinal_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sinal_data date,
  ADD COLUMN IF NOT EXISTS sinal_comprovante_path text,
  ADD COLUMN IF NOT EXISTS restante_forma text,
  ADD COLUMN IF NOT EXISTS restante_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restante_data date,
  ADD COLUMN IF NOT EXISTS restante_comprovante_path text;