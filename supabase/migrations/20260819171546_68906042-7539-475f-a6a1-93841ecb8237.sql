ALTER TABLE public.agendamentos ALTER COLUMN valor_total SET DEFAULT 500;
UPDATE public.agendamentos SET valor_total = 500 WHERE valor_total = 550 AND data_hora > now();