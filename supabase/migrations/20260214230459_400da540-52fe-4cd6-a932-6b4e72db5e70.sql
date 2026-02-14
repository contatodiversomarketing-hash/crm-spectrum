-- Drop restrictive policies and recreate as permissive for read access
DROP POLICY IF EXISTS "Authenticated users can read interacoes" ON interacoes_ia;
CREATE POLICY "Allow read interacoes" ON interacoes_ia FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can read configuracoes" ON configuracoes_sistema;
CREATE POLICY "Allow read configuracoes" ON configuracoes_sistema FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can read logs" ON logs_decisao;
CREATE POLICY "Allow read logs" ON logs_decisao FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can read automacoes" ON automacoes;
CREATE POLICY "Allow read automacoes" ON automacoes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can read memorias" ON memorias_ia;
CREATE POLICY "Allow read memorias" ON memorias_ia FOR SELECT USING (true);

-- Also fix insert/update policies for interacoes_ia (used by edge functions via service role, but also needed for client)
DROP POLICY IF EXISTS "Authenticated users can insert interacoes" ON interacoes_ia;
CREATE POLICY "Allow insert interacoes" ON interacoes_ia FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update interacoes" ON interacoes_ia;
CREATE POLICY "Allow update interacoes" ON interacoes_ia FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert configuracoes" ON configuracoes_sistema;
CREATE POLICY "Allow insert configuracoes" ON configuracoes_sistema FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update configuracoes" ON configuracoes_sistema;
CREATE POLICY "Allow update configuracoes" ON configuracoes_sistema FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert automacoes" ON automacoes;
CREATE POLICY "Allow insert automacoes" ON automacoes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update automacoes" ON automacoes;
CREATE POLICY "Allow update automacoes" ON automacoes FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert logs" ON logs_decisao;
CREATE POLICY "Allow insert logs" ON logs_decisao FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert memorias" ON memorias_ia;
CREATE POLICY "Allow insert memorias" ON memorias_ia FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update memorias" ON memorias_ia;
CREATE POLICY "Allow update memorias" ON memorias_ia FOR UPDATE USING (true);