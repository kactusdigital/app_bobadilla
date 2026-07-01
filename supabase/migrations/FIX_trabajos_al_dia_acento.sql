-- =====================================================================
-- FIX: unificar "Trabajos al dia" (legacy, sin acento) con "Trabajos al día"
-- =====================================================================
-- Contexto:
--   Una version anterior de la app guardaba el tipo SIN acento
--   ("Trabajos al dia") y con unidad = 'unid'. Por eso esos partes se leian
--   como "cantidad" en vez de "horas" y aparecian como una fila separada en
--   los informes/Excel (dos filas: "Trabajos al dia" y "Trabajos al día").
--
--   Diagnostico (01-07-2026):
--     Trabajos al dia | unid | 526 filas | suma 4365 | abr-may  <- legacy a corregir
--     Trabajos al día | hs   | 445 filas | suma 3586 | may-jun  <- correcto, no se toca
--
--   4365 / 526 ~= 8,3 por registro => es una jornada en HORAS. Se confirma
--   que el valor debe leerse como horas (unidad = 'hs'), no como cantidad.
--
-- Que hace:
--   1) Respalda los 526 registros a corregir en una tabla aparte.
--   2) Unifica el tipo (con acento) y cambia unidad 'unid' -> 'hs'.
--      El valor numerico (cantidad) NO se modifica: solo pasa a leerse como horas.
--   3) Verifica el resultado.
--
-- Es independiente del deploy FTP: es correccion de datos, no de codigo.
-- =====================================================================

-- 1) RESPALDO (por si hay que revertir). Snapshot de las filas afectadas.
--    Cubre ambas formas: sin acento ('Trabajos al dia') y con acento pero con la
--    unidad equivocada ('Trabajos al día' + 'unid'), que es como queda la
--    re-contaminacion despues de desplegar la 2.7.1 (el tipo ya va con acento,
--    pero un cache viejo puede seguir subiendo unidad 'unid').
create table if not exists entries_v4_backup_trabajos_dia_20260701 as
select *
from entries_v4
where tipo in ('Trabajos al dia', 'Trabajos al día')
  and unidad = 'unid';

-- 2) CORRECCION. Tipo con acento + unidad 'hs' (asi el valor se lee como horas).
--    El numero (cantidad) NO se toca: solo pasa a leerse como horas.
update entries_v4
set tipo   = 'Trabajos al día',
    unidad = 'hs'
where tipo in ('Trabajos al dia', 'Trabajos al día')
  and unidad = 'unid';

-- 3) VERIFICACION. Tras el update deberia quedar UNA sola combinacion:
--    "Trabajos al día" | hs. Ya no deberia existir "Trabajos al dia" / unid.
select
  tipo,
  unidad,
  count(*)      as filas,
  sum(cantidad) as suma_cantidad,
  min(fecha)    as desde,
  max(fecha)    as hasta
from entries_v4
where lower(tipo) like 'trabajos al d%a'
group by tipo, unidad
order by tipo, unidad;

-- =====================================================================
-- REVERTIR (solo si algo salio mal), usando el respaldo:
--
--   update entries_v4 e
--   set tipo = b.tipo, unidad = b.unidad
--   from entries_v4_backup_trabajos_dia_20260701 b
--   where e.id = b.id;
--
-- Y para limpiar el respaldo cuando este todo confirmado:
--   drop table entries_v4_backup_trabajos_dia_20260701;
-- =====================================================================
