INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'zegestevanin@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.profiles (user_id, nome, email)
SELECT id, COALESCE(raw_user_meta_data->>'nome',''), email FROM auth.users WHERE email = 'zegestevanin@gmail.com'
ON CONFLICT DO NOTHING;