-- =====================================================================
-- CAPA 2 — SCRIPT ÚNICO DE PRODUCCIÓN (pegar y ejecutar COMPLETO en el
-- SQL Editor de Supabase, con el rol owner). Ejecutar ANTES del deploy FTP.
-- =====================================================================
-- Hace 3 cosas:
--   1) Idempotencia client_uuid (anti-duplicados / anti-pérdida).
--   2) Nueva actividad "Poda de plantas madres" (+ 2 sub-tareas).
--   3) Borra 4 duplicados activos del Grupo A (con tombstone anti-resurrección).
-- Todo en una transacción: si algo falla, no se aplica nada.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) IDEMPOTENCIA client_uuid
-- ---------------------------------------------------------------------
ALTER TABLE public.entries_v4 ADD COLUMN IF NOT EXISTS client_uuid text;

UPDATE public.entries_v4
SET client_uuid = 'legacy-' || id::text
WHERE client_uuid IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entries_v4_client_uuid_uidx
  ON public.entries_v4 (client_uuid);

-- ---------------------------------------------------------------------
-- 2) NUEVA ACTIVIDAD DE CATÁLOGO
-- ---------------------------------------------------------------------
UPDATE public.config_v4
SET categorias = (categorias::jsonb || '{
      "Poda de plantas madres": ["Extraccion material vegetal lenoso", "Extraccion material vegetal yemas"]
    }'::jsonb),
    updated_at = now()
WHERE id = 'activities';

UPDATE public.config_v4
SET updated_at = now()
WHERE id = 'main';

-- ---------------------------------------------------------------------
-- 3) BORRADO DE 4 DUPLICADOS ACTIVOS (Grupo A no bloqueados)
--    Se conserva 1 de cada par; se borran estos ids.
-- ---------------------------------------------------------------------
-- 3a) Tombstone (para que ningún dispositivo los vuelva a subir)
INSERT INTO public.deleted_entries_v4 (entry_id, deleted_at)
SELECT v.id, now()
FROM (VALUES
  (17818036480403),  -- Segura Luis Antonio  | Adelanto/Ajuste | $143.431 | 01/06
  (17818096991991),  -- Paz Federico         | Adelanto -$200.000        | 15/06
  (17823139606933),  -- Gonzales Irma        | Arrancada $40.000         | 23/06
  (17823139606930)   -- Ramos Eli            | Arrancada $40.000         | 23/06
) AS v(id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.deleted_entries_v4 d WHERE d.entry_id = v.id
);

-- 3b) Borrado físico de entries_v4
DELETE FROM public.entries_v4
WHERE id IN (17818036480403, 17818096991991, 17823139606933, 17823139606930);

COMMIT;

-- =====================================================================
-- VERIFICACIONES (deben dar lo indicado)
-- =====================================================================
-- A) Idempotencia: sin_uuid = 0, uuids_duplicados = 0, total = 1040
SELECT
  (SELECT count(*) FROM public.entries_v4 WHERE client_uuid IS NULL)            AS sin_uuid,
  (SELECT count(*) FROM (
      SELECT client_uuid FROM public.entries_v4
      WHERE client_uuid IS NOT NULL GROUP BY client_uuid HAVING count(*) > 1
   ) d)                                                                          AS uuids_duplicados,
  (SELECT count(*) FROM public.entries_v4)                                       AS total_debe_ser_1040;

-- B) Nueva actividad presente con sus 2 sub-tareas
SELECT categorias -> 'Poda de plantas madres' AS poda_subtareas
FROM public.config_v4 WHERE id = 'activities';

-- C) Los 4 conservados SIGUEN existiendo (debe devolver 4 filas)
SELECT id, nombre, total FROM public.entries_v4
WHERE id IN (17818035487331, 17816309587818, 17823131057525, 17823131057526);

-- D) Los 4 borrados YA NO existen (debe devolver 0 filas)
SELECT id FROM public.entries_v4
WHERE id IN (17818036480403, 17818096991991, 17823139606933, 17823139606930);
