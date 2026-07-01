-- =====================================================================
-- FIX: corregir los roles en profiles para que dirección/admin vean TODO
-- Correr en el SQL Editor del dashboard de Supabase (rol owner).
-- Idempotente: se puede correr varias veces sin riesgo.
-- =====================================================================
-- CONTEXTO: el RLS de entries_v4 decide la visibilidad con
-- current_app_role(), que lee public.profiles. Si la fila de un usuario de
-- dirección quedó como 'encargado' (o falta), el servidor le recorta los
-- registros a "solo los propios", aunque la app lo muestre como Dirección.
-- =====================================================================

-- 0) Asegurar que TODO usuario tenga fila en profiles (los que falten -> según email)
INSERT INTO public.profiles (user_id, email, role)
SELECT
  u.id, u.email,
  CASE
    WHEN lower(u.email) IN ('fernandowebs@gmail.com','belen@bobadillaviveros.com','carlos@bobadillaviveros.com') THEN 'direccion'
    WHEN lower(u.email) = 'administracion@bobadillaviveros.com' THEN 'admin'
    WHEN lower(u.email) IN ('encargadogeneral@bobadillaviveros.com','encargadofinca@bobadillaviveros.com') THEN 'encargado'
    ELSE 'visor'
  END
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- 1) Forzar el rol correcto de dirección
UPDATE public.profiles SET role = 'direccion'
  WHERE lower(email) IN ('fernandowebs@gmail.com','belen@bobadillaviveros.com','carlos@bobadillaviveros.com')
    AND role <> 'direccion';

-- 2) Forzar el rol correcto de administración
UPDATE public.profiles SET role = 'admin'
  WHERE lower(email) = 'administracion@bobadillaviveros.com'
    AND role <> 'admin';

-- 3) Forzar el rol correcto de los encargados
UPDATE public.profiles SET role = 'encargado'
  WHERE lower(email) IN ('encargadogeneral@bobadillaviveros.com','encargadofinca@bobadillaviveros.com')
    AND role <> 'encargado';

-- 4) Verificación: deberías ver tu cuenta de dirección con role = 'direccion'
SELECT email, role FROM public.profiles ORDER BY role, email;
