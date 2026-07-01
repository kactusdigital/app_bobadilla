
-- =====================================================================
-- PROPUESTA DE REMEDIACIÓN DE SEGURIDAD (RLS) — Bobadilla Viveros
-- =====================================================================
-- REVISAR ANTES DE EJECUTAR. Correr en el SQL Editor del dashboard de
-- Supabase (requiere rol propietario/service_role; la anon key NO puede
-- modificar políticas).
--
-- MOTIVO (auditoría empírica con la anon key PÚBLICA, sin sesión):
--   entries_v4         -> SELECT/INSERT/UPDATE/DELETE PERMITIDOS a anon
--   config_v4          -> SELECT/INSERT/UPDATE/DELETE PERMITIDOS a anon
--   deleted_entries_v4 -> SELECT/INSERT/UPDATE PERMITIDOS a anon
--   whatsapp_messages  -> SELECT/INSERT/UPDATE/DELETE PERMITIDOS a anon
--   audit_log          -> YA protegida (solo authenticated lee; insert por trigger)
--
-- La anon key viaja en el bundle JS público: HOY cualquiera puede leer,
-- modificar y borrar TODOS los partes y la configuración sin iniciar sesión.
--
-- El inicio de sesión anónimo está DESHABILITADO en el proyecto, por lo que
-- todos los usuarios legítimos entran con email/contraseña => rol
-- `authenticated`. Restringir a `authenticated` NO rompe la app (la
-- sincronización ya exige sesión activa).
--
-- IMPORTANTE: este script revoca el acceso del rol `anon`. Antes de aplicar,
-- confirmá que ninguna lectura ocurre ANTES del login (en esta app las
-- lecturas a Supabase sólo corren tras autenticarse).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) entries_v4 : partes diarios (núcleo del negocio)
-- ---------------------------------------------------------------------
ALTER TABLE public.entries_v4 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entries_select_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_insert_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_update_authenticated" ON public.entries_v4;
DROP POLICY IF EXISTS "entries_delete_authenticated" ON public.entries_v4;

-- Lectura total para autenticados (dirección/admin/visor/encargado ven todo;
-- la restricción del encargado se mantiene en el cliente. Ver FASE 2 abajo
-- para llevar los roles a la base de datos).
CREATE POLICY "entries_select_authenticated" ON public.entries_v4
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "entries_insert_authenticated" ON public.entries_v4
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "entries_update_authenticated" ON public.entries_v4
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "entries_delete_authenticated" ON public.entries_v4
  FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 2) config_v4 : workers, catálogos, categorías
-- ---------------------------------------------------------------------
ALTER TABLE public.config_v4 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_select_authenticated" ON public.config_v4;
DROP POLICY IF EXISTS "config_write_authenticated" ON public.config_v4;

CREATE POLICY "config_select_authenticated" ON public.config_v4
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "config_write_authenticated" ON public.config_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 3) deleted_entries_v4 : tombstones de borrado
-- ---------------------------------------------------------------------
ALTER TABLE public.deleted_entries_v4 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deleted_select_authenticated" ON public.deleted_entries_v4;
DROP POLICY IF EXISTS "deleted_write_authenticated" ON public.deleted_entries_v4;

CREATE POLICY "deleted_select_authenticated" ON public.deleted_entries_v4
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "deleted_write_authenticated" ON public.deleted_entries_v4
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 4) whatsapp_messages : la app sólo lee y actualiza estado.
--    El webhook (edge function) inserta con service_role y NO se ve
--    afectado por estas políticas.
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_select_authenticated" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wa_update_authenticated" ON public.whatsapp_messages;

CREATE POLICY "wa_select_authenticated" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "wa_update_authenticated" ON public.whatsapp_messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 5) audit_log : ya tiene RLS + SELECT para authenticated.
--    Reforzamos que sea inmutable (sin UPDATE/DELETE desde la API).
--    El INSERT lo hace el trigger SECURITY DEFINER, no necesita policy.
-- ---------------------------------------------------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- (No se crean políticas de UPDATE/DELETE => quedan denegadas para todos
--  los roles vía API, manteniendo el log de auditoría a prueba de borrado.)

-- =====================================================================
-- VERIFICACIÓN (correr después de aplicar):
--   select schemaname, tablename, rowsecurity
--   from pg_tables where schemaname='public'
--     and tablename in ('entries_v4','config_v4','deleted_entries_v4','whatsapp_messages','audit_log');
--   -- rowsecurity debe ser true en todas
--
--   select tablename, policyname, roles, cmd
--   from pg_policies where schemaname='public' order by tablename, cmd;
-- =====================================================================

-- =====================================================================
-- FASE 2 (OPCIONAL, recomendado a mediano plazo): roles en la base de datos
-- ---------------------------------------------------------------------
-- Hoy los roles (direccion/admin/encargado/visor) se evalúan SÓLO en el
-- cliente. Para hacerlos cumplir a nivel DB conviene:
--   a) Tabla public.profiles(user_id uuid PK, role text) sincronizada con
--      auth.users, o un custom claim 'role' en el JWT.
--   b) Reescribir las políticas usando ese rol, p.ej. el encargado sólo ve
--      sus propios registros:
--        USING (
--          (auth.jwt() ->> 'role') in ('direccion','admin','visor')
--          OR created_by = auth.uid()
--        )
-- Esto replicaría en la DB la lógica que hoy está en Entries.tsx y cerraría
-- el hueco de que un encargado consulte la API directamente y vea todo.
-- =====================================================================
