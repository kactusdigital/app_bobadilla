# Plan — Pantalla de Auditoría + Operador legible

Estado: PLANTEADO, sin implementar. Documento de referencia para retomar.

## Objetivo

Poder auditar quién hizo qué en el sistema, y que la columna **Operador** se
muestre como **email o alias** (nombre antes del @) en vez del UUID crudo.

## Lo que YA existe (base para apoyarse)

- `entries_v4.created_by` (UUID) + `created_at`: quién creó cada registro y cuándo.
- Tabla `audit_log` (campos: `user_id`, `action`, `table_name`, `record_id`,
  `old_data`, `new_data`, `created_at`).
- Funciones en `src/supabaseClient.ts`: `logAuditAction()` (escribe) y
  `fetchAuditLogs()` (lee, hoy `limit 50`, ordenado por fecha desc).
- Tabla `public.profiles` (`user_id`, `email`, `role`) — legible por el cliente
  (a diferencia de `auth.users`, que está protegida).
- Trigger de base para BORRADOS ya existente (mencionado en el código).

## Parte 1 — Captura confiable (trigger de base)

`logAuditAction` (nivel app) NO es confiable: se puede saltear y falla en silencio
si RLS lo bloquea. Para auditoría real, capturar server-side con un trigger.

- Extender el trigger existente (hoy solo borrados) a **INSERT / UPDATE / DELETE**
  sobre `entries_v4`.
- Que escriba en `audit_log`: `user_id = auth.uid()`, `action` (insert/update/delete),
  `record_id`, `old_data`/`new_data` en JSON, `created_at = now()`.
- Marcar la función como `security definer` para que pueda insertar en `audit_log`
  aunque el usuario no tenga permiso directo.

## Parte 2 — Operador legible (email / alias)

`audit_log.user_id` es UUID. Mapear a email vía `public.profiles`:

- Opcion A (recomendada, cambio chico): en la app, traer una vez el mapa
  `user_id -> email` desde `profiles` y, al renderizar el log, reemplazar el UUID.
- Opcion B: vista SQL `audit_log_view` que cruce `audit_log` con `profiles` y ya
  devuelva el email; `fetchAuditLogs` leería de la vista.

Alias (nombre antes del @) — transformacion trivial en el front:

```js
const alias = (email) => (email || '').split('@')[0] || 'desconocido';
// belen@bobadillaviveros.com -> "belen"
```

## Parte 3 — Pantalla de Auditoría (UI)

- Visible SOLO para rol `direccion` / `admin` (usar el rol de `profiles`).
- Lee con `fetchAuditLogs` (subir el `limit 50` y agregar paginacion/filtros).
- Columnas sugeridas:
  - Fecha (`created_at`)
  - **Operador** = alias(email) del `user_id`  <-- lo pedido
  - Accion (alta / edicion / borrado)
  - Registro (`record_id`; opcionalmente enriquecido: trabajador + fecha)
  - Antes / Despues (expandible, desde `old_data` / `new_data`)
- Filtros utiles: por operador, por rango de fechas, por accion, por registro.

## Parte 4 — RLS / permisos

- `audit_log`: INSERT solo desde el trigger (security definer). SELECT solo para
  `direccion` / `admin`. Nadie edita ni borra el log (append-only).

## Consideraciones / detalles finos

- `record_id` enriquecido: si el registro fue borrado, el join a `entries_v4` no
  resuelve el nombre; mostrar el id igual y, si existe, el detalle.
- Performance: indexar `audit_log (created_at)` y `(user_id)`; paginar la UI.
- Volumen: con trigger de insert/update el log crece rapido; definir retencion
  (ej. purgar > N meses) si hace falta.
- `profiles` debe estar poblado para todos los usuarios (ver FIX_roles_profiles.sql).

## Orden sugerido de implementacion

1. Trigger insert/update/delete -> audit_log (captura confiable).
2. Vista o mapa `user_id -> email` (Operador legible + alias).
3. Pantalla de Auditoria con filtros (dirección/admin).
4. RLS append-only + índices.
