
-- Adicionar coluna respondeu na tabela automacoes
ALTER TABLE public.automacoes ADD COLUMN respondeu boolean NOT NULL DEFAULT false;
