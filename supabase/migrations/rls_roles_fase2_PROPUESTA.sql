-- =====================================================================
-- FASE 2 — ROLES EN LA BASE DE DATOS (RLS por rol) — Bobadilla Viveros
-- =====================================================================
-- REVISAR ANTES DE EJECUTAR. Correr en el SQL Editor del dashboard de
-- Supabase (rol propietario). Es la versión COMPLETA y supersede a
-- `enable_rls_security_PROPUESTA.sql`: si aplicás esta, no hace falta la otra
-- (esta también habilita RLS y elimina las políticas permisivas de Fase 1).
--
-- QUÉ HACE:
--   - Crea public.profiles (fuente de verdad de roles) + trigger de alta
--     automática + backfill de los usuarios existentes.
--   - Función helper current_app_role() (SECURITY DEFINER, sin recursión).
--   - Políticas RLS por ROL sobre entries_v4, replicando la lógica del cliente:
--       * direccion / admin  -> ven y editan TODO; sólo direccion borra todo.
--       * encargado          -> sólo ve / edita / borra SUS propios registros.
--       * visor              -> sólo lectura total, sin escritura.
--   - config_v4, deleted_entries_v4, whatsapp_messages: acceso para
--     authenticated (cierra el hueco de anon sin romper la sincronización).
--   - audit_log: inmutable (insert por trigger SECURITY DEFINER).
--
-- COMPATIBILIDAD CON LA SINCRONIZACIÓN:
--   `performBidirectionalSync` puede re-subir registros creados por otros
--   usuarios (descargados previamente). Por eso direccion/admin tienen
--   permiso de INSERT/UPDATE sobre cualquier `created_by`; el encargado queda
--   acotado a `created_by = auth.uid()`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla de perfiles (rol por usuario)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  role       text NOT NULL DEFAULT 'visor'
             CHECK (role IN ('direccion', 'admin', 'encargado', 'visor')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer su propio perfil (necesario para el cliente).
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- (No se crean políticas de escritura: los roles se gestionan desde el
--  dashboard / service_role para evitar que un usuario se auto-promueva.)

-- ---------------------------------------------------------------------
-- 2) Helper: rol del usuario actual.
--    SECURITY DEFINER para poder leer profiles sin disparar su propia RLS
--    (evita recursión cuando se usa dentro de otras políticas).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE user_id = auth.uid()),
    'visor'
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Alta automática de perfil al registrarse un usuario
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN lower(NEW.email) IN (
        'fernandowebs@gmail.com',
        'belen@bobadillaviveros.com',
        'carlos@bobadillaviveros.com'
      ) THEN 'direccion'
      WHEN lower(NEW.email) = 'administracion@bobadillaviveros.com' THEN 'admin'
      WHEN lower(NEW.email) IN (
        'encargadogeneral@bobadillaviveros.com',
        'encargadofinca@bobadillaviveros.com'
      ) THEN 'encargado'
      ELSE 'visor'
    END
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4) Backfill: crear perfiles para los usuarios YA existentes
-- ---------------------------------------------------------------------
INSERT INTO public.profiles (user_id, email, role)
SELECT
  u.id,
  u.email,
  CASE
    WHEN lower(u.email) IN (
      'fernandowebs@gmail.com',
      'belen@bobadillaviveros.com',
      'carlos@bobadillaviveros.com'
    ) THEN 'direccion'
    WHEN lower(u.email) = 'administracion@bobadillaviveros.com' THEN 'admin'
    WHEN lower(u.email) IN (
      'encargadogeneral@bobadillaviveros.com',
      'encargadofinca@bobadillaviveros.com'
    ) THEN 'encargado'
    ELSE 'visor'
  END
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- Asegurar el rol correcto de dirección/admin aunque ya tuvieran perfil:
UPDATE public.profiles SET role = 'direccion'
  WHERE lower(email) IN ('fernandowebs@gmail.com','belen@bobadillaviveros.com','carlos@bobadillaviveros.com')
    AND role <> 'direccion';
UPDATE public.profiles SET role = 'admin'
  WHERE lower(email) = 'administracion@bobadillaviveros.com'
    AND role <> 'admin';
UPDATE public.profiles SET role = 'encargado'
  WHERE lower(email) IN ('encargadogeneral@bobadillaviveros.com','encargadofinca@bobadillaviveros.com')
    AND role <> 'encargado';

-- ---------------------------------------------------------------------
-- 5) entries_v4 : políticas POR ROL
-- ---------------------------------------------------------------------
ALTER TABLE public.entries_v4 ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas (Fase 1 y/o versiones anteriores)
DROP POLICY IF EXISTS "entries_select_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_insert_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_update_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_delete_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_select_role" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_insert_role" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_update_role" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_delete_role" ON public.entries_v4;

-- SELECT: dirección/admin/visor ven TODO; encargado sólo lo suyo.
CREATE POLICY "entries_select_role" ON public.entries_v4
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('direccion', 'admin', 'visor')
    OR created_by = auth.uid()
  );

-- INSERT: visor no inserta. Dirección/admin pueden insertar cualquier
-- created_by (la sync re-sube registros de otros); el resto, sólo propios.
CREATE POLICY "entries_insert_role" ON public.entries_v4
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('direccion', 'admin')
    OR (public.current_app_role() = 'encargado' AND created_by = auth.uid())
  );

-- UPDATE: dirección/admin editan todo; encargado sólo lo suyo; visor nada.
CREATE POLICY "entries_update_role" ON public.entries_v4
  FOR UPDATE TO authenticated
  USING (
    public.current_app_role() IN ('direccion', 'admin')
    OR (public.current_app_role() = 'encargado' AND created_by = auth.uid())
  )
  WITH CHECK (
    public.current_app_role() IN ('direccion', 'admin')
    OR (public.current_app_role() = 'encargado' AND created_by = auth.uid())
  );

-- DELETE: sólo dirección borra todo; encargado sólo lo suyo (coincide con la UI).
CREATE POLICY "entries_delete_role" ON public.entries_v4
  FOR DELETE TO authenticated
  USING (
    public.current_app_role() = 'direccion'
    OR created_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- 6) config_v4 / deleted_entries_v4 / whatsapp_messages : authenticated
--    (cierra el hueco anon; no se restringe por rol para no romper la sync)
-- ---------------------------------------------------------------------
ALTER TABLE public.config_v4 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_select_authenticated" ON public.config_v4;
DROP POLICY IF EXISTS "config_write_authenticated"  ON public.config_v4;
CREATE POLICY "config_select_authenticated" ON public.config_v4
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_authenticated" ON public.config_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.deleted_entries_v4 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deleted_select_authenticated" ON public.deleted_entries_v4;
DROP POLICY IF EXISTS "deleted_write_authenticated"  ON public.deleted_entries_v4;
CREATE POLICY "deleted_select_authenticated" ON public.deleted_entries_v4
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deleted_write_authenticated" ON public.deleted_entries_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_select_authenticated" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wa_update_authenticated" ON public.whatsapp_messages;
CREATE POLICY "wa_select_authenticated" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_update_authenticated" ON public.whatsapp_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 7) audit_log : ya protegida; aseguramos RLS habilitada (inmutable por API)
-- ---------------------------------------------------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- VERIFICACIÓN (correr después de aplicar):
--   select * from public.profiles order by role;             -- roles correctos
--   select tablename, policyname, roles, cmd
--     from pg_policies where schemaname='public' order by tablename, cmd;
--   -- Probar con un JWT de encargado que sólo vea sus propios registros.
-- =====================================================================

-- ---------------------------------------------------------------------
-- NOTA app-side (opcional): hoy `getCurrentSupabaseUser` decide el rol por
-- email hardcodeado. Una vez con profiles, conviene leer el rol desde
-- public.profiles (select role where user_id = auth.uid()) para tener una
-- única fuente de verdad. La RLS de arriba ya es independiente del cliente.
-- ---------------------------------------------------------------------
