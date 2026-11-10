CREATE TABLE public.neuroacesso_horarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inicio timestamptz NOT NULL,
 fim timestamptz NOT NULL,
 ativo boolean NOT NULL DEFAULT true,
 criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neuroacesso_horarios TO authenticated;
GRANT ALL ON public.neuroacesso_horarios TO service_role;
ALTER TABLE public.neuroacesso_horarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipe_horarios ON public.neuroacesso_horarios FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao'));
CREATE TABLE public.neuroacesso_reunioes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 horario_id uuid NOT NULL REFERENCES public.neuroacesso_horarios(id),
 nome text NOT NULL,
 telefone text NOT NULL,
 email text NOT NULL,
 status text NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','cancelada','realizada')),
 criado_em timestamptz NOT NULL DEFAULT now(),
 CHECK (length(nome) BETWEEN 3 AND 150),
 CHECK (telefone ~ '^[0-9]{10,15}$'),
 CHECK (length(email) <= 255 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
GRANT SELECT, UPDATE ON public.neuroacesso_reunioes TO authenticated;
GRANT ALL ON public.neuroacesso_reunioes TO service_role;
ALTER TABLE public.neuroacesso_reunioes ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipe_reunioes ON public.neuroacesso_reunioes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao'));
CREATE POLICY equipe_atualiza_reunioes ON public.neuroacesso_reunioes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao'));
CREATE UNIQUE INDEX neuroacesso_reserva_unica ON public.neuroacesso_reunioes(horario_id) WHERE status <> 'cancelada';
CREATE FUNCTION public.validar_neuroacesso_horario() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(728491);
 IF NEW.fim <= NEW.inicio OR NEW.inicio <= now() THEN RAISE EXCEPTION 'Informe um horário futuro com término após o início'; END IF;
 IF TG_OP = 'UPDATE' AND (NEW.inicio <> OLD.inicio OR NEW.fim <> OLD.fim) THEN RAISE EXCEPTION 'Remova o horário livre e publique outro para alterar a data'; END IF;
 IF NEW.ativo AND EXISTS (SELECT 1 FROM public.neuroacesso_horarios h WHERE h.id <> NEW.id AND h.ativo AND h.inicio < NEW.fim AND h.fim > NEW.inicio) THEN RAISE EXCEPTION 'Já existe um horário nesse intervalo'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_horario BEFORE INSERT OR UPDATE OF inicio, fim ON public.neuroacesso_horarios FOR EACH ROW EXECUTE FUNCTION public.validar_neuroacesso_horario();
CREATE FUNCTION public.neuroacesso_disponibilidade() RETURNS TABLE(id uuid, inicio timestamptz, fim timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT h.id, h.inicio, h.fim FROM public.neuroacesso_horarios h WHERE h.ativo AND h.inicio > now() AND NOT EXISTS (SELECT 1 FROM public.neuroacesso_reunioes r WHERE r.horario_id = h.id AND r.status <> 'cancelada') ORDER BY h.inicio;
$$;
REVOKE ALL ON FUNCTION public.neuroacesso_disponibilidade() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.neuroacesso_disponibilidade() TO anon, authenticated, service_role;
CREATE FUNCTION public.neuroacesso_agendar(p_horario_id uuid, p_nome text, p_telefone text, p_email text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.neuroacesso_horarios; reserva uuid; n text := btrim(p_nome); t text := regexp_replace(p_telefone, '[^0-9]', '', 'g'); e text := lower(btrim(p_email));
BEGIN
 IF n IS NULL OR length(n) NOT BETWEEN 3 AND 150 OR n !~ '[^[:space:]]+[[:space:]]+[^[:space:]]+' THEN RAISE EXCEPTION 'Informe seu nome completo'; END IF;
 IF t IS NULL OR t !~ '^[0-9]{10,15}$' THEN RAISE EXCEPTION 'Informe telefone com DDD'; END IF;
 IF e IS NULL OR length(e) > 255 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Informe um e-mail válido'; END IF;
 SELECT * INTO h FROM public.neuroacesso_horarios WHERE id = p_horario_id FOR UPDATE;
 IF NOT FOUND OR NOT h.ativo OR h.inicio <= now() THEN RAISE EXCEPTION 'Horário indisponível. Escolha outro'; END IF;
 IF EXISTS (SELECT 1 FROM public.neuroacesso_reunioes WHERE horario_id = h.id AND status <> 'cancelada') THEN RAISE EXCEPTION 'Este horário acabou de ser reservado. Escolha outro'; END IF;
 INSERT INTO public.neuroacesso_reunioes(horario_id,nome,telefone,email) VALUES(h.id,n,t,e) RETURNING id INTO reserva;
 RETURN reserva;
END $$;
REVOKE ALL ON FUNCTION public.neuroacesso_agendar(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.neuroacesso_agendar(uuid,text,text,text) TO anon, authenticated, service_role;