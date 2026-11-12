CREATE OR REPLACE FUNCTION public.neuroacesso_agendar(p_horario_id uuid, p_nome text, p_telefone text, p_email text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE h public.neuroacesso_horarios; reserva uuid; n text := btrim(p_nome); t text := regexp_replace(p_telefone, '[^0-9]', '', 'g'); e text := lower(btrim(p_email)); administrador boolean := coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false);
BEGIN
 IF n IS NULL OR length(n) NOT BETWEEN 3 AND 150 OR n !~ '[^[:space:]]+[[:space:]]+[^[:space:]]+' THEN RAISE EXCEPTION 'Informe seu nome completo'; END IF;
 IF t IS NULL OR t !~ '^[0-9]{10,15}$' THEN RAISE EXCEPTION 'Informe telefone com DDD'; END IF;
 IF e IS NULL OR length(e)>255 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Informe um e-mail válido'; END IF;
 SELECT * INTO h FROM public.neuroacesso_horarios WHERE id=p_horario_id FOR UPDATE;
 IF NOT FOUND OR NOT h.ativo OR (NOT administrador AND NOT public.neuroacesso_horario_permitido(h.inicio,h.fim)) THEN RAISE EXCEPTION 'Horário indisponível. Escolha outro'; END IF;
 IF h.fim <= h.inicio THEN RAISE EXCEPTION 'Horário inválido'; END IF;
 IF h.inicio < clock_timestamp() + interval '5 hours' THEN RAISE EXCEPTION 'Agende com pelo menos 5 horas de antecedência'; END IF;
 IF EXISTS(SELECT 1 FROM public.neuroacesso_reunioes WHERE horario_id=h.id AND status<>'cancelada') THEN RAISE EXCEPTION 'Este horário acabou de ser reservado. Escolha outro'; END IF;
 INSERT INTO public.neuroacesso_reunioes(horario_id,nome,telefone,email) VALUES(h.id,n,t,e) RETURNING id INTO reserva;
 RETURN reserva;
END $function$;
REVOKE ALL ON FUNCTION public.neuroacesso_agendar(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.neuroacesso_agendar(uuid,text,text,text) TO anon, authenticated, service_role;