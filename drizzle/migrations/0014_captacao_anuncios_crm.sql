CREATE TABLE public.captacao_ofertas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), titulo text NOT NULL CHECK (length(titulo) BETWEEN 2 AND 120), descricao text NOT NULL DEFAULT '', pipeline_id uuid NOT NULL REFERENCES public.pipelines(id), coluna_chave text NOT NULL, whatsapp text NOT NULL CHECK (whatsapp ~ '^55[0-9]{10,11}$'), ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.captacao_ofertas TO authenticated;
GRANT ALL ON public.captacao_ofertas TO service_role;
ALTER TABLE public.captacao_ofertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY captacao_ofertas_equipe ON public.captacao_ofertas FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisao'));
CREATE POLICY captacao_ofertas_admin ON public.captacao_ofertas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TABLE public.captacao_inscricoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), oferta_id uuid NOT NULL REFERENCES public.captacao_ofertas(id), lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE, nome text NOT NULL, telefone text NOT NULL, consentimento boolean NOT NULL CHECK(consentimento), origem jsonb NOT NULL DEFAULT '{}', request_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.captacao_inscricoes TO authenticated;
GRANT ALL ON public.captacao_inscricoes TO service_role;
ALTER TABLE public.captacao_inscricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY captacao_inscricoes_equipe ON public.captacao_inscricoes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisao'));
CREATE INDEX captacao_inscricoes_oferta_idx ON public.captacao_inscricoes(oferta_id,created_at DESC);
CREATE INDEX captacao_inscricoes_lead_idx ON public.captacao_inscricoes(lead_id);
CREATE FUNCTION public.captacao_registrar(p_oferta uuid,p_nome text,p_telefone text,p_variacoes text[],p_chave text,p_request uuid,p_origem jsonb,p_existente uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_oferta public.captacao_ofertas; v_lead uuid; v_inscricao uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('captacao:' || p_chave,0));
 SELECT id INTO v_inscricao FROM public.captacao_inscricoes WHERE request_id=p_request;
 IF v_inscricao IS NOT NULL THEN RETURN v_inscricao; END IF;
 SELECT * INTO v_oferta FROM public.captacao_ofertas WHERE id=p_oferta AND ativo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Oferta indisponível'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pipeline_colunas WHERE pipeline_id=v_oferta.pipeline_id AND chave=v_oferta.coluna_chave) THEN RAISE EXCEPTION 'Coluna de destino indisponível'; END IF;
 SELECT id INTO v_lead FROM public.leads WHERE telefone=ANY(p_variacoes) OR (p_existente IS NOT NULL AND id=p_existente) ORDER BY criado_em,id LIMIT 1 FOR UPDATE;
 IF v_lead IS NULL THEN
  INSERT INTO public.leads(nome,telefone,origem,pipeline_id,status_pipeline,observacoes) VALUES(p_nome,p_telefone,'anuncio:' || v_oferta.slug,v_oferta.pipeline_id,v_oferta.coluna_chave,'Cadastro recebido: ' || v_oferta.titulo) RETURNING id INTO v_lead;
 ELSE
  UPDATE public.leads SET nome=CASE WHEN nome IS NULL OR btrim(nome)='' OR nome !~ '[[:alpha:]]' THEN p_nome ELSE nome END, observacoes=concat_ws(E'\n',observacoes,'Novo interesse: ' || v_oferta.titulo || ' (cadastro do anúncio)') WHERE id=v_lead;
 END IF;
 INSERT INTO public.captacao_inscricoes(oferta_id,lead_id,nome,telefone,consentimento,origem,request_id) VALUES(p_oferta,v_lead,p_nome,p_telefone,true,p_origem,p_request) RETURNING id INTO v_inscricao;
 RETURN v_inscricao;
END; $$;
REVOKE ALL ON FUNCTION public.captacao_registrar(uuid,text,text,text[],text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.captacao_registrar(uuid,text,text,text[],text,uuid,jsonb,uuid) TO service_role;