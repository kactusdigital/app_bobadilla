-- =====================================================================
-- EXTRA (paquete Capa 2) — Nueva actividad de catálogo
--   "Poda de plantas madres" con 2 sub-tareas:
--     1) Extraccion material vegetal lenoso
--     2) Extraccion material vegetal yemas
-- =====================================================================
-- Pedido del cliente. Se agrega al catálogo en Supabase (config_v4) para que
-- aparezca en TODOS los dispositivos que ya usan la app (los que instalan de
-- cero la toman de initialData.ts, ya actualizado en el código).
--
-- CUÁNDO EJECUTAR: junto con el deploy de Capa 2, cuando NO estén cargando datos.
-- Estilo del nombre/sub-tareas: sin tildes ni ñ, igual que el resto del catálogo
-- ("Estaquillado Lenoso", "Extraccion de material", "Fertilizacion").
-- =====================================================================

-- 1. Sumar la actividad al mapa de actividades (fila id='activities').
--    El operador || hace merge de JSON; si la clave ya existiera, la pisa con
--    estos valores (idempotente).
UPDATE public.config_v4
SET categorias = (categorias::jsonb || '{
      "Poda de plantas madres": ["Extraccion material vegetal lenoso", "Extraccion material vegetal yemas"]
    }'::jsonb),
    updated_at = now()
WHERE id = 'activities';

-- 2. Bumpear el timestamp de la config principal (fila id='main') para FORZAR
--    que todos los clientes re-descarguen el catálogo en su próxima sync.
--    (La app dispara la descarga de actividades según el updated_at de 'main'.)
UPDATE public.config_v4
SET updated_at = now()
WHERE id = 'main';

-- 3. Verificación: debe listar la nueva actividad con sus 2 sub-tareas.
SELECT categorias -> 'Poda de plantas madres' AS poda_subtareas
FROM public.config_v4
WHERE id = 'activities';

-- NOTA de robustez: si justo un dispositivo tuviera una config local MÁS nueva,
-- al sincronizar podría subir su catálogo y pisar este cambio. Por eso conviene
-- ejecutarlo cuando NADIE esté editando configuración, y verificar después que la
-- actividad sigue presente.
