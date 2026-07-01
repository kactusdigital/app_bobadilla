-- =====================================================================
-- FIX RLS — eliminar políticas permisivas viejas y reaplicar por rol
-- =====================================================================
-- CONTEXTO: la RLS quedó habilitada (rowsecurity=true) pero anon y los
-- encargados seguían viendo TODAS las filas => existía una política
-- permisiva preexistente (ej. "TO public USING (true)") que dejaba todo
-- abierto. Este script borra TODAS las políticas de las tablas afectadas
-- (sin depender del nombre) y reaplica únicamente las correctas.
--
-- SEGURO: RLS permanece habilitada todo el tiempo. En el instante entre el
-- DROP y el CREATE, una tabla con RLS y sin políticas DENIEGA todo (falla
-- cerrado), por lo que no hay ventana de exposición.
-- Requiere rol propietario (SQL Editor del dashboard).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Borrar TODAS las políticas existentes en las tablas afectadas
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
-- 2) Asegurar RLS habilitada (idempotente)
-- ---------------------------------------------------------------------
ALTER TABLE public.entries_v4         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_v4          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_entries_v4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3) profiles: cada usuario lee su propio perfil
-- ---------------------------------------------------------------------
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4) entries_v4: políticas POR ROL (usa public.current_app_role())
-- ---------------------------------------------------------------------
CREATE POLICY "entries_select_role" ON public.entries_v4
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('direccion', 'admin', 'visor')
    OR created_by = auth.uid()
  );

CREATE POLICY "entries_insert_role" ON public.entries_v4
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('direccion', 'admin')
    OR (public.current_app_role() = 'encargado' AND created_by = auth.uid())
  );

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

CREATE POLICY "entries_delete_role" ON public.entries_v4
  FOR DELETE TO authenticated
  USING (
    public.current_app_role() = 'direccion'
    OR created_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- 5) config_v4 / deleted_entries_v4: authenticated (cierra anon)
-- ---------------------------------------------------------------------
CREATE POLICY "config_select_authenticated" ON public.config_v4
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_write_authenticated" ON public.config_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "deleted_select_authenticated" ON public.deleted_entries_v4
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deleted_write_authenticated" ON public.deleted_entries_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- whatsapp_messages: la app sólo lee y actualiza estado. El webhook usa
-- service_role (que IGNORA RLS), así que no se ve afectado por estas políticas.
CREATE POLICY "wa_select_authenticated" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_update_authenticated" ON public.whatsapp_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 6) audit_log: SOLO lectura para authenticated (inserción por trigger
--    SECURITY DEFINER; sin UPDATE/DELETE => inmutable).
-- ---------------------------------------------------------------------
CREATE POLICY "audit_select_authenticated" ON public.audit_log
  FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- VERIFICACIÓN:
--   select tablename, policyname, cmd, roles, permissive
--   from pg_policies where schemaname='public' order by tablename, cmd;
--   -- NINGUNA política debe tener {public} o {anon} en 'roles'.
-- =====================================================================
