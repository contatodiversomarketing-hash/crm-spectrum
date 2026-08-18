ALTER TABLE public.interacoes_ia REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interacoes_ia;
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;