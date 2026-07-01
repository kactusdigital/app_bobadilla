-- =====================================================================
-- CAPA 2 — Clave de idempotencia client_uuid (anti-duplicados / anti-pérdida)
-- =====================================================================
-- ORDEN DE EJECUCIÓN OBLIGATORIO:
--   1) Ejecutar la FASE A de este script en el SQL Editor de Supabase.
--   2) INMEDIATAMENTE DESPUÉS, desplegar la app nueva (v2.7.0) por FTP.
-- No ejecutar la FASE A mientras la app vieja (v2.6.0) esté cargando datos:
-- la columna nueva es opcional, así que la app vieja sigue funcionando, pero
-- conviene aplicar migración + deploy juntos para no dejar ventanas raras.
--
-- Qué hace: cada parte de trabajo pasa a tener un identificador único e
-- irrepetible (client_uuid). La base lo usa para reconocer "este parte ya
-- existe" y ACTUALIZARLO en lugar de duplicarlo (re-subida, regeneración de id,
-- doble envío). Los registros viejos reciben un uuid DETERMINISTA `legacy-<id>`
-- que el cliente calcula igual, de modo que nunca se dupliquen al re-sincronizar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FASE A — aplicar junto con el deploy de la v2.7.0
-- ---------------------------------------------------------------------

-- 1. Nueva columna (opcional por ahora; la app vieja la deja en NULL sin romper).
ALTER TABLE public.entries_v4 ADD COLUMN IF NOT EXISTS client_uuid text;

-- 2. Backfill DETERMINISTA de los registros existentes.
--    Clave: 'legacy-' || id  ->  el cliente calcula EXACTAMENTE el mismo valor,
--    así que al re-subir un registro viejo se reconoce y no se duplica.
UPDATE public.entries_v4
SET client_uuid = 'legacy-' || id::text
WHERE client_uuid IS NULL;

-- 3. Índice único: impide físicamente dos filas con el mismo client_uuid.
--    (Los NULL son distintos entre sí en Postgres, así que tolera la ventana de
--    transición si algún cliente viejo inserta sin uuid.)
CREATE UNIQUE INDEX IF NOT EXISTS entries_v4_client_uuid_uidx
  ON public.entries_v4 (client_uuid);

-- 4. Verificación: deben dar 0 filas sin uuid y 0 uuids duplicados.
SELECT
  (SELECT count(*) FROM public.entries_v4 WHERE client_uuid IS NULL)            AS sin_uuid,
  (SELECT count(*) FROM (
      SELECT client_uuid FROM public.entries_v4
      WHERE client_uuid IS NOT NULL
      GROUP BY client_uuid HAVING count(*) > 1
   ) d)                                                                          AS uuids_duplicados,
  (SELECT count(*) FROM public.entries_v4)                                       AS total;

-- ---------------------------------------------------------------------
-- FASE B — OPCIONAL, ejecutar DÍAS DESPUÉS, cuando todos los dispositivos
-- ya estén en v2.7.0 (la app nueva siempre manda client_uuid no nulo).
-- Hace obligatoria la columna a futuro. NO ejecutar antes de tiempo.
-- ---------------------------------------------------------------------
-- ALTER TABLE public.entries_v4 ALTER COLUMN client_uuid SET NOT NULL;
