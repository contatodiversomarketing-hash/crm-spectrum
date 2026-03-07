INSERT INTO public.user_roles (user_id, role)
VALUES ('2b565bc2-ae54-49bb-a58e-39502ff5e336', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;