import { Worker, Entry } from './types';

// Storage keys (mismos que usa el resto de la app)
const WORKERS_KEY = 'bobadilla_workers';
const ENTRIES_KEY = 'bobadilla_entries';
const CONFIG_TS_KEY = 'bobadilla_config_timestamp';
const DEDUPE_FLAG = 'bobadilla_migration_dedupe_workers_v1';

export interface DedupeResult {
  ran: boolean;
  mergedWorkers: number;   // cuántos workers duplicados se fusionaron
  remappedEntries: number; // cuántas entradas cambiaron de worker_id
  removedWorkers: number;  // cuántos registros de worker se eliminaron
  groups: number;          // cuántos nombres tenían duplicados
}

const EMPTY: DedupeResult = { ran: false, mergedWorkers: 0, remappedEntries: 0, removedWorkers: 0, groups: 0 };

// Normaliza un nombre para comparar (minúsculas, espacios colapsados)
const normName = (s: string): string => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Un worker es "sintético" si fue generado automáticamente por la
 * sincronización (no es un alta real hecha por un usuario). Estos son los
 * candidatos preferentes a descartarse cuando hay un duplicado de nombre.
 */
function isSynthetic(w: Worker): boolean {
  const legajo = (w.legajo || '').toUpperCase().trim();
  return (
    w.id === 'w_desconocido' ||
    w.id.startsWith('wsync_') ||
    legajo === 'SYNC' ||
    legajo === 'SIN-ASIGNAR' ||
    /^#GEN/i.test(w.legajo || '')
  );
}

// Puntaje de "completitud" para desempatar entre dos workers reales
const completeness = (w: Worker): number =>
  (w.dni ? 1 : 0) + (w.cuit ? 1 : 0) + (w.bankAccount ? 1 : 0) + (w.fixedSalary ? 1 : 0);

/**
 * Migración única y idempotente: consolida los workers que comparten el mismo
 * nombre (duplicados creados por la versión anterior del sync, que generaba un
 * worker con id aleatorio en cada sincronización). Elige un worker canónico por
 * nombre —priorizando los reales sobre los sintéticos— y remapea hacia él los
 * `worker_id` de todas las entradas locales. Los workers de nombre único NO se
 * tocan (son el único registro de esa persona).
 *
 * Opera directamente sobre localStorage. Si `force` es true, se ejecuta aunque
 * ya se haya corrido antes (útil para re-correrla manualmente).
 */
export function runWorkerDedupeMigration(force = false): DedupeResult {
  if (typeof localStorage === 'undefined') return EMPTY;
  if (!force && localStorage.getItem(DEDUPE_FLAG)) return EMPTY;

  let workers: Worker[];
  let entries: Entry[];
  try {
    workers = JSON.parse(localStorage.getItem(WORKERS_KEY) || '[]');
    entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
  } catch {
    return EMPTY;
  }

  // Si todavía no hay datos cargados, no marcamos la migración como hecha:
  // así podrá ejecutarse en la próxima sesión cuando ya existan workers.
  if (!Array.isArray(workers) || workers.length === 0) return EMPTY;

  // Agrupar workers por nombre normalizado
  const groups = new Map<string, Worker[]>();
  for (const w of workers) {
    const key = normName(w.name);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(w);
    else groups.set(key, [w]);
  }

  // Construir el remapeo oldId -> canonicalId para cada grupo con duplicados
  const remap = new Map<string, string>();
  const removeIds = new Set<string>();
  let dupGroups = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    dupGroups++;

    // Canónico: primero los reales (no sintéticos); entre iguales, el más completo
    const sorted = [...group].sort((a, b) => {
      const aS = isSynthetic(a) ? 1 : 0;
      const bS = isSynthetic(b) ? 1 : 0;
      if (aS !== bS) return aS - bS;
      return completeness(b) - completeness(a);
    });

    const canonical = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].id === canonical.id) continue;
      remap.set(sorted[i].id, canonical.id);
      removeIds.add(sorted[i].id);
    }
  }

  // Nada que limpiar: marcamos como hecha y salimos
  if (remap.size === 0) {
    localStorage.setItem(DEDUPE_FLAG, new Date().toISOString());
    return { ...EMPTY, ran: true };
  }

  // Remapear worker_id de las entradas hacia el worker canónico
  let remappedEntries = 0;
  const newEntries = entries.map(e => {
    const target = remap.get(e.worker_id);
    if (target && target !== e.worker_id) {
      remappedEntries++;
      return { ...e, worker_id: target };
    }
    return e;
  });

  // Eliminar los workers duplicados
  const newWorkers = workers.filter(w => !removeIds.has(w.id));

  // Persistir y forzar la subida de la lista limpia en la próxima sincronización
  localStorage.setItem(WORKERS_KEY, JSON.stringify(newWorkers));
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(newEntries));
  localStorage.setItem(CONFIG_TS_KEY, String(Date.now()));
  localStorage.setItem(DEDUPE_FLAG, new Date().toISOString());

  return {
    ran: true,
    mergedWorkers: removeIds.size,
    remappedEntries,
    removedWorkers: removeIds.size,
    groups: dupGroups
  };
}
