-- =====================================================================
-- DIAGNÓSTICO: "dirección solo ve 7 de 26 registros"
-- Correr en el SQL Editor del dashboard de Supabase (rol owner).
-- Es de SOLO LECTURA: no modifica nada.
-- =====================================================================

-- 1) ¿Cuántos registros hay REALMENTE en el servidor? (el owner ignora RLS)
SELECT count(*) AS total_registros FROM public.entries_v4;

-- 2) ¿Cómo se reparten por quién los creó? (created_by) + email del creador
SELECT
  e.created_by,
  u.email,
  count(*) AS cantidad
FROM public.entries_v4 e
LEFT JOIN auth.users u ON u.id = e.created_by
GROUP BY e.created_by, u.email
ORDER BY cantidad DESC;
--  ⚠️ Si aparece una fila con created_by = NULL, esos registros son
--     "antiguos" (sin dueño) y un encargado NUNCA los vería.

-- 3) Contenido de profiles: ¿qué rol tiene cada usuario según la BASE?
SELECT p.user_id, p.email, p.role, u.email AS email_auth
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id
ORDER BY p.role, p.email;
--  ⚠️ Acá está la clave: buscá tu cuenta de dirección
--     (fernandowebs@gmail.com / belen@... / carlos@...).
--     Si su 'role' NO dice 'direccion', ESE es el problema.

-- 4) ¿Hay usuarios SIN fila en profiles? (caen al default 'visor')
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- 5) Política de lectura realmente desplegada sobre entries_v4
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'entries_v4'
ORDER BY cmd;
