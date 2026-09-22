ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS parcelas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS valor_parcela numeric;