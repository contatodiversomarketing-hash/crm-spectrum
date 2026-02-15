
-- Adicionar coluna bloqueio_ate na tabela memorias_ia para controlar opt-out temporário
ALTER TABLE public.memorias_ia ADD COLUMN bloqueio_ate timestamp with time zone DEFAULT NULL;
