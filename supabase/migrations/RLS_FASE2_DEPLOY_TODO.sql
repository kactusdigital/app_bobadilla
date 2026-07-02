-- =====================================================================
-- RLS FASE 2 — SCRIPT ÚNICO DE PRODUCCIÓN (pegar y ejecutar COMPLETO en
-- el SQL Editor de Supabase, rol owner).
-- =====================================================================
-- ORDEN DE DEPLOY: ejecutar DESPUÉS de que v2.7.3 esté live (v2.7.3 trae
-- el guard que impide que encargados/visor intenten subir registros
-- ajenos, que la RLS rechazaría chunk completo).
--
-- QUÉ HACE (consolida rls_roles_fase2_PROPUESTA.sql +
-- rls_fix_drop_permissive_PROPUESTA.sql + FASE B de Capa 2):
--   1) public.profiles (fuente de verdad de roles) + trigger de alta
--      automática + backfill de usuarios existentes.
--   2) current_app_role() (SECURITY DEFINER, sin recursión).
--   3) Barre TODAS las políticas previas (incluido el QUICKFIX permisivo)
--      y recrea solo las correctas, por rol. RLS queda habilitada todo el
--      tiempo: entre DROP y CREATE la tabla falla cerrado (sin ventana).
--   4) FASE B Capa 2: client_uuid SET NOT NULL.
-- Todo en una transacción: si algo falla, no se aplica nada.
--
-- DESPUÉS DE APLICAR: pedir a encargados y visor que toquen "Refrescar"
-- una vez antes de volver a cargar (higiene de caché; con el guard de
-- v2.7.3 no es bloqueante, pero limpia los registros ajenos cacheados).
-- =====================================================================

BEGIN;

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

-- ---------------------------------------------------------------------
-- 2) Helper: rol del usuario actual (SECURITY DEFINER evita recursión)
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
-- 4) Backfill: perfiles para los usuarios YA existentes
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
-- 5) Barrer TODAS las políticas previas (sin depender del nombre)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('entries_v4', 'config_v4', 'deleted_entries_v4', 'whatsapp_messages', 'audit_log', 'profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6) RLS habilitada en todas las tablas (idempotente)
-- ---------------------------------------------------------------------
ALTER TABLE public.entries_v4         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_v4          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_entries_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7) profiles: cada usuario lee su propio perfil (lo usa resolveUserRole).
--    Sin políticas de escritura: los roles se gestionan desde el dashboard.
-- ---------------------------------------------------------------------
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8) entries_v4: políticas POR ROL
-- ---------------------------------------------------------------------
-- SELECT: dirección/admin/visor ven TODO; encargado sólo lo suyo.
CREATE POLICY "entries_select_role" ON public.entries_v4
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('direccion', 'admin', 'visor')
    OR created_by = auth.uid()
  );

-- INSERT: visor no inserta. Dirección/admin cualquier created_by (la sync
-- re-sube registros de otros); encargado sólo propios.
CREATE POLICY "entries_insert_role" ON public.entries_v4
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('direccion', 'admin')
    OR (public.current_app_role() = 'encargado' AND created_by = auth.uid())
  );

-- UPDATE: dirección/admin todo; encargado sólo lo suyo; visor nada.
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

-- DELETE: sólo dirección borra todo; encargado sólo lo suyo (igual que la UI).
CREATE POLICY "entries_delete_role" ON public.entries_v4
  FOR DELETE TO authenticated
  USING (
    public.current_app_role() = 'direccion'
    OR created_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- 9) config_v4 / deleted_entries_v4 / whatsapp_messages: authenticated
--    (cierra anon; sin restricción por rol para no romper la sync)
-- ---------------------------------------------------------------------
CREATE POLICY "config_select_authenticated" ON public.config_v4
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_authenticated" ON public.config_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "deleted_select_authenticated" ON public.deleted_entries_v4
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deleted_write_authenticated" ON public.deleted_entries_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- whatsapp_messages: la app lee y actualiza estado. El webhook usa
-- service_role (ignora RLS), no se ve afectado.
CREATE POLICY "wa_select_authenticated" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_update_authenticated" ON public.whatsapp_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 10) audit_log: SOLO lectura para authenticated (la bitácora de Config
--     la lee dirección; inserción por trigger SECURITY DEFINER => inmutable)
-- ---------------------------------------------------------------------
CREATE POLICY "audit_select_authenticated" ON public.audit_log
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 11) FASE B de Capa 2: client_uuid obligatorio (todos los clientes 2.7.x
--     lo mandan siempre; el backfill 'legacy-<id>' cubrió lo histórico)
-- ---------------------------------------------------------------------
ALTER TABLE public.entries_v4 ALTER COLUMN client_uuid SET NOT NULL;

COMMIT;

-- =====================================================================
-- VERIFICACIONES (correr después del COMMIT; resultados esperados)
-- =====================================================================
-- A) Perfiles: 3 direccion, 1 admin, 2 encargado (+ visores si hay)
SELECT role, count(*), array_agg(email ORDER BY email) FROM public.profiles GROUP BY role;

-- B) Políticas: NINGUNA fila debe tener {public} ni {anon} en roles
SELECT tablename, policyname, cmd, roles
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- C) client_uuid: is_nullable debe ser 'NO'
SELECT is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entries_v4' AND column_name = 'client_uuid';
