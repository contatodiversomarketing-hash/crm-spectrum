INSERT INTO public.user_roles (user_id, role)
VALUES ('2f44de0c-1397-4a41-9335-86d560a0c010', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;