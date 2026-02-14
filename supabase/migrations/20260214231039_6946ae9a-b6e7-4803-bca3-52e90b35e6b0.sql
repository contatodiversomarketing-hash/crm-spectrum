
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisao', 'analista');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create user_roles table (separate from profiles per security best practices)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer function to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RLS for profiles
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 7. RLS for user_roles
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. Update all existing table policies to require authentication

-- interacoes_ia
DROP POLICY IF EXISTS "Allow read interacoes" ON interacoes_ia;
DROP POLICY IF EXISTS "Allow insert interacoes" ON interacoes_ia;
DROP POLICY IF EXISTS "Allow update interacoes" ON interacoes_ia;

CREATE POLICY "Authenticated can read interacoes" ON interacoes_ia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert interacoes" ON interacoes_ia
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin or supervisao can update interacoes" ON interacoes_ia
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisao'));

-- configuracoes_sistema
DROP POLICY IF EXISTS "Allow read configuracoes" ON configuracoes_sistema;
DROP POLICY IF EXISTS "Allow insert configuracoes" ON configuracoes_sistema;
DROP POLICY IF EXISTS "Allow update configuracoes" ON configuracoes_sistema;

CREATE POLICY "Authenticated can read configuracoes" ON configuracoes_sistema
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can insert configuracoes" ON configuracoes_sistema
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update configuracoes" ON configuracoes_sistema
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- logs_decisao
DROP POLICY IF EXISTS "Allow read logs" ON logs_decisao;
DROP POLICY IF EXISTS "Allow insert logs" ON logs_decisao;

CREATE POLICY "Authenticated can read logs" ON logs_decisao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert logs" ON logs_decisao
  FOR INSERT TO authenticated WITH CHECK (true);

-- automacoes
DROP POLICY IF EXISTS "Allow read automacoes" ON automacoes;
DROP POLICY IF EXISTS "Allow insert automacoes" ON automacoes;
DROP POLICY IF EXISTS "Allow update automacoes" ON automacoes;

CREATE POLICY "Authenticated can read automacoes" ON automacoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert automacoes" ON automacoes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update automacoes" ON automacoes
  FOR UPDATE TO authenticated USING (true);

-- memorias_ia
DROP POLICY IF EXISTS "Allow read memorias" ON memorias_ia;
DROP POLICY IF EXISTS "Allow insert memorias" ON memorias_ia;
DROP POLICY IF EXISTS "Allow update memorias" ON memorias_ia;

CREATE POLICY "Authenticated can read memorias" ON memorias_ia
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert memorias" ON memorias_ia
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update memorias" ON memorias_ia
  FOR UPDATE TO authenticated USING (true);

-- 9. Allow service_role (edge functions) to bypass RLS - this is automatic in Supabase
-- service_role_key always bypasses RLS, no additional config needed
