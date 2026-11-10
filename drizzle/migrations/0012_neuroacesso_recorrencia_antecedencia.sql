CREATE OR REPLACE FUNCTION public.neuroacesso_horario_permitido(p_inicio timestamptz, p_fim timestamptz) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT extract(isodow FROM p_inicio AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5 AND (p_inicio AT TIME ZONE 'America/Sao_Paulo')::date = (p_fim AT TIME ZONE 'America/Sao_Paulo')::date AND (p_inicio AT TIME ZONE 'America/Sao_Paulo')::time >= time '14:00' AND (p_fim AT TIME ZONE 'America/Sao_Paulo')::time <= time '19:00' AND p_fim > p_inicio;
$$;
CREATE OR REPLACE FUNCTION public.neuroacesso_disponibilidade() RETURNS TABLE(id uuid, inicio timestamptz, fim timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT h.id,h.inicio,h.fim FROM public.neuroacesso_horarios h WHERE h.ativo AND h.inicio >= statement_timestamp() + interval '5 hours' AND public.neuroacesso_horario_permitido(h.inicio,h.fim) AND NOT EXISTS(SELECT 1 FROM public.neuroacesso_reunioes r WHERE r.horario_id=h.id AND r.status <> 'cancelada') ORDER BY h.inicio;
$$;
CREATE OR REPLACE FUNCTION public.neuroacesso_agendar(p_horario_id uuid, p_nome text, p_telefone text, p_email text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.neuroacesso_horarios; reserva uuid; n text := btrim(p_nome); t text := regexp_replace(p_telefone, '[^0-9]', '', 'g'); e text := lower(btrim(p_email));
BEGIN
 IF n IS NULL OR length(n) NOT BETWEEN 3 AND 150 OR n !~ '[^[:space:]]+[[:space:]]+[^[:space:]]+' THEN RAISE EXCEPTION 'Informe seu nome completo'; END IF;
 IF t IS NULL OR t !~ '^[0-9]{10,15}$' THEN RAISE EXCEPTION 'Informe telefone com DDD'; END IF;
 IF e IS NULL OR length(e)>255 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Informe um e-mail válido'; END IF;
 SELECT * INTO h FROM public.neuroacesso_horarios WHERE id=p_horario_id FOR UPDATE;
 IF NOT FOUND OR NOT h.ativo OR NOT public.neuroacesso_horario_permitido(h.inicio,h.fim) THEN RAISE EXCEPTION 'Horário indisponível. Escolha outro'; END IF;
 IF h.inicio < clock_timestamp() + interval '5 hours' THEN RAISE EXCEPTION 'Agende com pelo menos 5 horas de antecedência'; END IF;
 IF EXISTS(SELECT 1 FROM public.neuroacesso_reunioes WHERE horario_id=h.id AND status<>'cancelada') THEN RAISE EXCEPTION 'Este horário acabou de ser reservado. Escolha outro'; END IF;
 INSERT INTO public.neuroacesso_reunioes(horario_id,nome,telefone,email) VALUES(h.id,n,t,e) RETURNING id INTO reserva;
 RETURN reserva;
END $$;
CREATE FUNCTION public.neuroacesso_renovar_horarios() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; hora integer; i timestamptz; f timestamptz; total integer := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(728491);
 FOR d IN SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + n) FROM generate_series(0,59) n LOOP
  IF extract(isodow FROM d) BETWEEN 1 AND 5 THEN
   FOR hora IN 14..18 LOOP
    i := (d + make_time(hora,0,0)) AT TIME ZONE 'America/Sao_Paulo'; f := i + interval '1 hour';
    IF i > now() AND NOT EXISTS(SELECT 1 FROM public.neuroacesso_horarios h WHERE h.inicio < f AND h.fim > i) THEN
     INSERT INTO public.neuroacesso_horarios(inicio,fim) VALUES(i,f); total := total + 1;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.neuroacesso_renovar_horarios() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neuroacesso_renovar_horarios() TO service_role;
SELECT cron.schedule('neuroacesso-renovar-horarios','0 3 * * *','SELECT public.neuroacesso_renovar_horarios()');