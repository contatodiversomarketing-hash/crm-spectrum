-- lovable-cron-fallback-reviewed: Timed external WhatsApp notice has no enabled delay-until provider; scheduler is armed on enqueue and unscheduled after pending queue drains, with five-minute delivery tolerance.
CREATE TABLE public.aviso_espera_config (id boolean PRIMARY KEY DEFAULT true CHECK (id), token text NOT NULL DEFAULT encode(gen_random_bytes(32),'hex'), endpoint text NOT NULL);
GRANT ALL ON public.aviso_espera_config TO service_role;
ALTER TABLE public.aviso_espera_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_config ON public.aviso_espera_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.avisos_espera_atendimento (telefone text PRIMARY KEY, destino text NOT NULL, episodio uuid NOT NULL DEFAULT gen_random_uuid(), inicio_espera timestamptz NOT NULL, ultima_recebida timestamptz NOT NULL, estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','enviando','enviado','cancelado','falhou')));
GRANT ALL ON public.avisos_espera_atendimento TO service_role;
ALTER TABLE public.avisos_espera_atendimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_queue ON public.avisos_espera_atendimento FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX avisos_espera_pendentes ON public.avisos_espera_atendimento (inicio_espera) WHERE estado='pendente';
CREATE OR REPLACE FUNCTION public.armar_avisos_espera() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
PERFORM pg_advisory_xact_lock(728192);
IF EXISTS (SELECT 1 FROM public.aviso_espera_config) AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='aviso-espera-atendimento') THEN
PERFORM cron.schedule('aviso-espera-atendimento','*/5 * * * *', $cmd$SELECT net.http_post(url := endpoint, headers := jsonb_build_object('Content-Type','application/json','x-espera-token',token), body := '{}'::jsonb) FROM public.aviso_espera_config WHERE id=true;$cmd$);
END IF; END $$;
CREATE OR REPLACE FUNCTION public.desarmar_avisos_espera() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE jid bigint; BEGIN
PERFORM pg_advisory_xact_lock(728192);
IF NOT EXISTS (SELECT 1 FROM public.avisos_espera_atendimento WHERE estado='pendente') THEN
SELECT jobid INTO jid FROM cron.job WHERE jobname='aviso-espera-atendimento';
IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END IF; END $$;
CREATE OR REPLACE FUNCTION public.registrar_espera_atendimento() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE tel text; destino text; human_reply boolean; BEGIN
IF NEW.canal <> 'whatsapp' THEN RETURN NEW; END IF;
tel := regexp_replace(COALESCE(NEW.paciente_externo_id,''),'^tel:','');
tel := regexp_replace(tel,'[^0-9]','','g');
IF length(tel) IN (10,11) THEN tel := '55'||tel; END IF;
destino := tel;
IF length(tel)=13 AND left(tel,2)='55' AND substring(tel,5,1)='9' THEN tel := left(tel,4)||substring(tel,6); END IF;
IF length(tel) NOT BETWEEN 12 AND 15 THEN RETURN NEW; END IF;
human_reply := NULLIF(btrim(NEW.resposta_final),'') IS NOT NULL AND (NULLIF(NEW.atendente_humano,'') IS NOT NULL OR NEW.sistema_origem IN ('crm_manual','whatsapp_echo')) AND COALESCE(NEW.whatsapp_status,'') NOT IN ('failed','error','pending');
IF human_reply THEN
UPDATE public.avisos_espera_atendimento SET estado='cancelado' WHERE telefone=tel AND ultima_recebida <= NEW.criado_em;
PERFORM public.desarmar_avisos_espera();
ELSIF TG_OP='INSERT' AND NULLIF(btrim(NEW.mensagem_usuario),'') IS NOT NULL AND NEW.sistema_origem IN ('whatsapp_recebido','whatsapp','megaapi') THEN
INSERT INTO public.avisos_espera_atendimento AS q(telefone,destino,inicio_espera,ultima_recebida) VALUES(tel,destino,NEW.criado_em,NEW.criado_em)
ON CONFLICT(telefone) DO UPDATE SET
destino=EXCLUDED.destino,
inicio_espera=CASE WHEN q.estado='cancelado' THEN EXCLUDED.inicio_espera ELSE q.inicio_espera END,
ultima_recebida=EXCLUDED.ultima_recebida,
episodio=CASE WHEN q.estado='cancelado' THEN gen_random_uuid() ELSE q.episodio END,
estado=CASE WHEN q.estado='cancelado' THEN 'pendente' ELSE q.estado END
WHERE EXCLUDED.ultima_recebida > q.ultima_recebida;
PERFORM public.armar_avisos_espera();
END IF; RETURN NEW; END $$;
CREATE TRIGGER interacoes_espera_atendimento AFTER INSERT OR UPDATE OF resposta_final,atendente_humano,whatsapp_status ON public.interacoes_ia FOR EACH ROW EXECUTE FUNCTION public.registrar_espera_atendimento();
CREATE OR REPLACE FUNCTION public.reservar_avisos_espera() RETURNS SETOF public.avisos_espera_atendimento LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH due AS (SELECT telefone FROM public.avisos_espera_atendimento WHERE estado='pendente' AND inicio_espera < now()-interval '2 hours' AND ultima_recebida > now()-interval '23 hours' ORDER BY inicio_espera LIMIT 6 FOR UPDATE SKIP LOCKED), expired AS (UPDATE public.avisos_espera_atendimento SET estado='falhou' WHERE estado='pendente' AND ultima_recebida <= now()-interval '23 hours')
UPDATE public.avisos_espera_atendimento q SET estado='enviando' FROM due WHERE q.telefone=due.telefone RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.armar_avisos_espera(), public.desarmar_avisos_espera(), public.registrar_espera_atendimento(), public.reservar_avisos_espera() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.armar_avisos_espera(), public.desarmar_avisos_espera(), public.registrar_espera_atendimento(), public.reservar_avisos_espera() TO service_role;