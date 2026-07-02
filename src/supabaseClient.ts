import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Entry, DeletedEntry, Worker, MasterCatalogs, WhatsAppMessage } from './types';
import { checkAppVersion } from './versionCheck';

// ID estable y único para el placeholder de registros huérfanos (sin trabajador asignable)
export const UNKNOWN_WORKER_ID = 'w_desconocido';

/**
 * Genera un ID numérico único para las entradas (entries_v4).
 *
 * IMPORTANTE: la columna `id` de `entries_v4` en Supabase es NUMÉRICA (bigint),
 * por lo que NO podemos usar UUIDs de texto (romperían el upsert y la columna).
 * El esquema anterior (`Date.now() * 10 + random(0..9)`) sólo tenía 10 valores
 * para diferenciar registros creados en el mismo milisegundo, así que al cargar
 * varios trabajadores de golpe colisionaban y se sobrescribían en Supabase
 * (causa real del "15 registros que se vuelven 14").
 *
 * Esta versión usa un reloj monotónico por dispositivo. El ID es
 * `base * 100 + slot`, donde `base` arranca en Date.now() (13 dígitos) y
 * `slot` (0..99) diferencia registros creados en el mismo milisegundo. Si una
 * carga masiva agota los 100 slots de un milisegundo, `base` avanza al
 * "siguiente milisegundo virtual", de modo que NUNCA se repite un ID por más
 * registros que se carguen de golpe. El resultado tiene 15 dígitos (muy por
 * debajo de Number.MAX_SAFE_INTEGER y del límite de 15 dígitos que valida la
 * sincronización). El slot se siembra con un valor aleatorio por sesión para
 * reducir además colisiones entre dispositivos distintos.
 */
let __idBase = 0;
let __idSlot = Math.floor(Math.random() * 100);
export function generateEntryId(): string {
  const now = Date.now();
  if (now > __idBase) {
    __idBase = now;
  } else {
    // Mismo milisegundo (o reloj estancado): consumimos el siguiente slot.
    __idSlot++;
    if (__idSlot > 99) {
      // Se agotaron los slots: avanzamos a un milisegundo virtual.
      __idBase++;
      __idSlot = 0;
    }
  }
  return String(__idBase * 100 + __idSlot);
}

// Storage Keys
const CREDENTIALS_KEY = 'bobadilla_supabase_creds';
const ENTRIES_KEY = 'bobadilla_entries';
const WORKERS_KEY = 'bobadilla_workers';
const CATALOGS_KEY = 'bobadilla_catalogs';
const LAST_SYNC_KEY = 'bobadilla_last_sync';

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  deleted: number;
  configSynced: boolean;
  message: string;
}

// Environment Variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function getStoredCredentials(): { url: string; anonKey: string } | null {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  }
  return null;
}

export function saveCredentials(url: string, anonKey: string): void {
  // Obsoleto: ahora usamos .env
}

export function clearCredentials(): void {
  // Obsoleto
}

let supabaseInstance: SupabaseClient | null = null;

// Get client instance dynamically
export function createSupabaseInstance(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Faltan credenciales de Supabase en el archivo .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
    return null;
  }
  
  try {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseInstance;
  } catch (e) {
    console.error('Failed to create Supabase client', e);
    return null;
  }
}

export interface SupabaseUser {
  id: string;
  email?: string;
  role: string;
}

// Mapeo de rol por email (compatibilidad / fallback cuando aún no existe la
// tabla profiles de la Fase 2, o no hay fila para el usuario).
function roleFromEmailFallback(email?: string, metadataRole?: any): string {
  const e = (email || '').toLowerCase();
  if (['fernandowebs@gmail.com', 'belen@bobadillaviveros.com', 'carlos@bobadillaviveros.com'].includes(e)) {
    return 'direccion';
  }
  if (e === 'administracion@bobadillaviveros.com') {
    return 'admin';
  }
  if (['encargadogeneral@bobadillaviveros.com', 'encargadofinca@bobadillaviveros.com'].includes(e)) {
    return 'encargado';
  }
  return String(metadataRole || 'visor');
}

/**
 * Resuelve el rol del usuario. Fuente de verdad: la tabla `profiles` (Fase 2).
 * Si la tabla todavía no existe o no hay fila para el usuario, cae al mapeo por
 * email, de modo que el código funcione tanto antes como después de aplicar la
 * migración de roles en la base de datos.
 */
async function resolveUserRole(client: SupabaseClient, user: any): Promise<string> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error && data?.role) {
      return String(data.role);
    }
  } catch (e) {
    // Tabla inexistente u otro error -> usamos el fallback por email.
  }
  return roleFromEmailFallback(user.email, user.user_metadata?.role || (user as any).raw_user_meta_data?.role);
}

export async function getCurrentSupabaseUser(): Promise<SupabaseUser | null> {
  const client = createSupabaseInstance();
  if (!client) return null;
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return {
      id: user.id,
      email: user.email,
      role: await resolveUserRole(client, user)
    };
  } catch (e) {
    return null;
  }
}

export async function loginSupabaseUser(email: string, password: string): Promise<{ success: boolean; message: string; user?: SupabaseUser }> {
  const client = createSupabaseInstance();
  if (!client) return { success: false, message: 'Supabase no está configurado.' };
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: error.message };
    }
    const user = data.user;
    return {
      success: true,
      message: 'Sesión iniciada con éxito.',
      user: {
        id: user.id,
        email: user.email,
        role: await resolveUserRole(client, user)
      }
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error inesperado de red.' };
  }
}

export async function registerSupabaseUser(email: string, password: string, role: 'direccion' | 'admin' | 'encargado' | 'visor'): Promise<{ success: boolean; message: string }> {
  const client = createSupabaseInstance();
  if (!client) return { success: false, message: 'Supabase no está configurado.' };
  try {
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { role }
      }
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Registro exitoso. Revise su bandeja o inicie sesión directamente.' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error de registro.' };
  }
}

export async function logoutSupabaseUser(): Promise<void> {
  const client = createSupabaseInstance();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (e) {
    console.error(e);
  }
}

// Log audit actions to Supabase server
export async function logAuditAction(action: string, tableName: string, recordId?: string, oldData?: any, newData?: any): Promise<boolean> {
  const client = createSupabaseInstance();
  if (!client) return false;
  try {
    const { data: { user } } = await client.auth.getUser();
    const payload = {
      user_id: user?.id || null,
      action,
      table_name: tableName,
      record_id: recordId || null,
      old_data: oldData ? oldData : null,
      new_data: newData ? newData : null,
      created_at: new Date().toISOString()
    };
    
    const { error } = await client.from('audit_log').insert(payload);
    if (error) {
      console.warn('Could not log audit action server-side due to missing permissions or RLS:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Audit logging exception', e);
    return false;
  }
}

export interface AuditLogItem {
  id: number;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
}

export async function fetchAuditLogs(): Promise<{ success: boolean; data?: AuditLogItem[]; message?: string }> {
  const client = createSupabaseInstance();
  if (!client) return { success: false, message: 'Supabase no está configurado o inicializado.' };
  try {
    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, data: data as AuditLogItem[] };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error al descargar registros de auditoría de Supabase.' };
  }
}

// Test Connection
export async function testSupabaseConnection(url: string, anonKey: string): Promise<boolean> {
  if (!url || !anonKey) return false;
  try {
    const client = createClient(url, anonKey);
    // Simple query to verify connectivity and auth keys on entries_v4
    const { error } = await client.from('entries_v4').select('id').limit(1);
    
    // If the error is 'PGRST116' or relation doesn't exists, we might have connection but no tables yet.
    if (error && error.message.toLowerCase().includes('failed to fetch')) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Convierte una fila cruda de `entries_v4` (Supabase) al modelo local `Entry`.
 *
 * Centraliza el parseo (horas/cantidad/rate, JSON embebido en `descripcion`) y la
 * resolución a prueba de fallos del `worker_id`: si el trabajador no existe
 * localmente, lo crea con un id estable derivado del nombre (o cae al placeholder
 * "Trabajador Desconocido"), de modo que ningún registro quede huérfano ni se
 * dupliquen trabajadores en sincronizaciones sucesivas. Puede mutar `localWorkers`
 * (y persistirlo) cuando hace falta materializar un trabajador.
 *
 * IMPORTANTE: copia `created_by` desde el servidor. Antes el mapeo lo omitía, de
 * modo que al bajar registros se perdía el autor y el filtro del rol "encargado"
 * (que sólo ve lo suyo) ocultaba todo lo descargado.
 */
// Normaliza tipos legacy sin acento a su forma canonica del catalogo. Una version
// vieja guardaba "Trabajos al dia" SIN acento, lo que duplicaba el tipo en los
// informes (dos filas "Trabajos al dia" / "Trabajos al día"). Ademas, los
// dispositivos con cache viejo re-suben ese texto al sincronizar y re-contaminan
// la base; por eso normalizamos tanto al LEER (mapServerRowToEntry) como al SUBIR
// (payload del upsert), sin depender de limpiar los datos una sola vez.
function canonicalizeEntryType(raw: string): string {
  const key = String(raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (key === 'trabajos al dia') return 'Trabajos al día';
  return raw;
}

function mapServerRowToEntry(s: any, localWorkers: Worker[]): Entry {
  let hours = 0;
  let quantity = 0;
  let rate = Number(s.precio_unitario || 0);
  let worker_id = '';
  let paymentMethod = s.forma_pago || '';
  let notes = s.descripcion || '';
  let subtask = s.trabajo || '';

  try {
    if (s.descripcion && s.descripcion.startsWith('{')) {
      const parsedDesc = JSON.parse(s.descripcion);
      hours = typeof parsedDesc.hours === 'number' ? parsedDesc.hours : 0;
      quantity = typeof parsedDesc.quantity === 'number' ? parsedDesc.quantity : 0;
      rate = typeof parsedDesc.rate === 'number' ? parsedDesc.rate : Number(s.precio_unitario || 0);
      worker_id = parsedDesc.worker_id || '';
      notes = '';
    } else {
      if (s.unidad === 'hs' || s.unidad === 'horas') {
        hours = Number(s.cantidad || 0);
      } else {
        quantity = Number(s.cantidad || 0);
      }
    }
  } catch (e) {
    if (s.unidad === 'hs' || s.unidad === 'horas') {
      hours = Number(s.cantidad || 0);
    } else {
      quantity = Number(s.cantidad || 0);
    }
  }

  if (!worker_id) {
    const cleanName = (s.nombre || '').toLowerCase().trim();
    if (cleanName) {
      const matchedWorker = localWorkers.find(w => w.name.toLowerCase().trim() === cleanName);
      if (matchedWorker) {
        worker_id = matchedWorker.id;
      } else {
        const stableId = 'wsync_' + cleanName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        let synced = localWorkers.find(w => w.id === stableId);
        if (!synced) {
          synced = {
            id: stableId,
            name: s.nombre,
            category: s.categoria || 'Peon General',
            regime: (s.regimen as any) || 'temporal',
            hourlyRate: Number(s.precio_unitario || 0),
            isActive: true,
            legajo: 'SYNC'
          };
          localWorkers.push(synced);
          localStorage.setItem(WORKERS_KEY, JSON.stringify(localWorkers));
          localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
        }
        worker_id = stableId;
      }
    } else {
      let generic = localWorkers.find(w => w.id === UNKNOWN_WORKER_ID);
      if (!generic) {
        generic = {
          id: UNKNOWN_WORKER_ID,
          name: 'Trabajador Desconocido',
          category: 'Sin categoría',
          regime: 'temporal',
          hourlyRate: 0,
          isActive: false,
          legajo: 'SIN-ASIGNAR'
        };
        localWorkers.push(generic);
        localStorage.setItem(WORKERS_KEY, JSON.stringify(localWorkers));
        localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
      }
      worker_id = UNKNOWN_WORKER_ID;
    }
  }

  const canonType = canonicalizeEntryType(s.tipo);
  // Auto-correccion legacy: "Trabajos al día" se mide por HORAS. Los registros
  // viejos (sin acento, unidad 'unid') guardaban el valor como cantidad. Si el
  // tipo canonico es por horas pero el valor cayo en cantidad, lo leemos como
  // horas, para que informes y liquidacion salgan bien aunque un cache viejo
  // vuelva a subir esos registros con la unidad equivocada.
  if (canonType === 'Trabajos al día' && quantity > 0 && hours === 0) {
    hours = quantity;
    quantity = 0;
  }

  return {
    id: String(s.id),
    worker_id: worker_id || UNKNOWN_WORKER_ID,
    date: s.fecha,
    type: canonType,
    location: s.lugar || '',
    quadro: s.cuadro || '',
    specie: s.especie || '',
    activity: s.actividad_principal || '',
    subtask: subtask,
    notes: notes,
    paymentMethod: paymentMethod,
    hours: hours,
    quantity: quantity,
    amount: Number(s.total || 0),
    rate: rate,
    locked: s.locked === true,
    updated_at: s.created_at,
    created_by: s.created_by || undefined,
    // CAPA 2: conservamos la clave de idempotencia que viene del servidor para que
    // el registro local mantenga su identidad estable en futuras sincronizaciones.
    client_uuid: s.client_uuid || undefined
  };
}

/**
 * Descarga TODAS las filas de `entries_v4` paginando. El REST de Supabase
 * devuelve como máximo 1000 filas por petición: sin esto, cualquier lectura
 * con `select('*')` queda silenciosamente truncada cuando la tabla crece.
 */
async function fetchAllEntryRows(client: SupabaseClient): Promise<{ rows: any[]; error: string | null }> {
  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];
  while (true) {
    const { data, error } = await client
      .from('entries_v4')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows, error: null };
}

/**
 * CAPA 1 — Fuente de verdad en el servidor.
 *
 * Trae TODOS los registros activos directamente de `entries_v4` (paginando, porque
 * el REST de Supabase devuelve máximo 1000 filas por petición), descarta los que
 * figuran en `deleted_entries_v4`, y los mapea al modelo local. De este modo todos
 * los roles que ven el 100% (dirección, administración, visor) muestran exactamente
 * lo mismo, sin depender de la foto vieja del `localStorage` de cada dispositivo.
 *
 * Para no perder trabajo cargado sin conexión, conserva además los registros
 * locales "pendientes" (los que todavía no existen en el servidor). El resultado se
 * cachea en `localStorage` para el modo offline.
 */
export async function fetchServerEntries(): Promise<{ success: boolean; entries: Entry[]; message?: string }> {
  const client = createSupabaseInstance();
  if (!client) return { success: false, entries: [], message: 'Supabase no está configurado.' };

  try {
    // 1. IDs borrados (tombstones) para no mostrarlos.
    const { data: serverDeleted } = await client
      .from('deleted_entries_v4')
      .select('entry_id');
    const deletedIds = new Set((serverDeleted || []).map((d: any) => String(d.entry_id)));

    // 2. Trabajadores locales para resolver nombres -> worker_id.
    const localWorkers: Worker[] = JSON.parse(localStorage.getItem(WORKERS_KEY) || '[]');

    // 3. Descargar TODAS las filas paginando (1000 por página).
    const { rows: rawRows, error: rowsError } = await fetchAllEntryRows(client);
    if (rowsError) {
      return { success: false, entries: [], message: rowsError };
    }

    // 4. Mapear (excluyendo borrados).
    const serverEntries: Entry[] = [];
    const serverIds = new Set<string>();
    // CAPA 2: índice de client_uuid ya presentes en el servidor. Al subir un parte,
    // el servidor lo reconoce por client_uuid y le asigna SU propio id numérico,
    // distinto del id temporal local. Si comparásemos solo por id, la copia local
    // quedaría como "pendiente" para siempre y se sumaría como un fantasma duplicado
    // (inflando totales como "Costo Neto de Plantilla"). Por eso también indexamos
    // el client_uuid para descartar esos duplicados ya sincronizados.
    const serverClientUuids = new Set<string>();
    for (const s of rawRows) {
      const idStr = String(s.id);
      if (deletedIds.has(idStr)) continue;
      serverIds.add(idStr);
      if (s.client_uuid) serverClientUuids.add(String(s.client_uuid));
      serverEntries.push(mapServerRowToEntry(s, localWorkers));
    }

    // 5. Conservar registros locales pendientes (offline, aún no subidos).
    //    Un local es "pendiente" solo si NO coincide por id NI por client_uuid con
    //    ninguna fila del servidor: así un parte ya subido (con id remoto nuevo) deja
    //    de arrastrar su gemelo local.
    const localEntries: Entry[] = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
    const pendingLocal = localEntries.filter(e =>
      !e.deleted &&
      !(e.client_uuid && serverClientUuids.has(String(e.client_uuid))) &&
      !serverIds.has(String(e.id).replace(/\D/g, '')) &&
      !serverIds.has(String(e.id)) &&
      !deletedIds.has(String(e.id).replace(/\D/g, ''))
    );

    const merged = [...serverEntries, ...pendingLocal];

    // 6. Cachear para offline.
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(merged));

    return { success: true, entries: merged };
  } catch (e: any) {
    return { success: false, entries: [], message: e?.message || 'Error al leer registros del servidor.' };
  }
}

/**
 * Sync logic: Bidirectional (v4 Tables)
 * 1. Upload local unsynced or updated entries using entries_v4.
 * 2. Delete entries in Supabase entries_v4 that are soft-deleted locally, insert to 'deleted_entries_v4' table, and hard-delete locally.
 * 3. Fetch 'deleted_entries_v4' from Supabase and remove matched records from local storage.
 * 4. Fetch all records from Supabase 'entries_v4' and upsert into local storage if they are newer.
 * 5. Sync 'config_v4' table:
 *    - Store workers and catalogs as JSON columns in row id 'main' and 'activities' in config_v4.
 *    - Whichever is newer gets pushed/pulled.
 */
export async function performBidirectionalSync(): Promise<SyncResult> {
  const versionStatus = await checkAppVersion();
  if (!versionStatus.isUpdated) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      configSynced: false,
      message: `¡Versión antigua detectada! (Servidor: ${versionStatus.serverVersion}). Por favor, recargue la página para sincronizar (vacíe la caché si es necesario).`
    };
  }

  const client = createSupabaseInstance();
  if (!client) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      configSynced: false,
      message: 'Supabase no está configurado o las credenciales son inválidas.'
    };
  }

  // Force active auth session
  const currentUserObj = await getCurrentSupabaseUser();
  if (!currentUserObj) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      configSynced: false,
      message: 'No hay ninguna sesión activa. Inicie sesión para sincronizar.'
    };
  }

  try {
    // ----------------------------------------
    // 1. Retrieve current local state
    // ----------------------------------------
    const localEntriesStr = localStorage.getItem(ENTRIES_KEY) || '[]';
    let localEntries: Entry[] = JSON.parse(localEntriesStr);
    
    const localWorkersStr = localStorage.getItem(WORKERS_KEY) || '[]';
    const localWorkers: Worker[] = JSON.parse(localWorkersStr);
    
    const localCatalogsStr = localStorage.getItem(CATALOGS_KEY) || 'null';
    let localCatalogs: MasterCatalogs = JSON.parse(localCatalogsStr);

    let uploadedCount = 0;
    let deletedCount = 0;
    let downloadedCount = 0;
    let configSynced = false;

    // ----------------------------------------
    // 2. Config table sync (workers, hourly rates, catalogs) via config_v4
    // ----------------------------------------
    // DO THIS FIRST so we have the latest workers before uploading entries
    const { data: serverMainData, error: mainGetError } = await client
      .from('config_v4')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();

    const { data: serverActData, error: actGetError } = await client
      .from('config_v4')
      .select('*')
      .eq('id', 'activities')
      .maybeSingle();

    if (!mainGetError) {
      const serverMainTimestamp = serverMainData?.updated_at ? new Date(serverMainData.updated_at).getTime() : 0;
      const localConfigTimestamp = Number(localStorage.getItem('bobadilla_config_timestamp') || '0');

      if (serverMainTimestamp > localConfigTimestamp && serverMainData) {
        // Download server configuration
        const loadedWorkers = serverMainData.workers || [];
        let loadedCategories = serverMainData.categorias || [];
        if (loadedCategories.length > 0) {
          if (typeof loadedCategories[0] === 'string') {
            loadedCategories = loadedCategories.map((c: string) => ({ name: c, defaultRate: 4500, description: 'Nómina agropecuaria' }));
          } else if (loadedCategories[0].nombre) {
            loadedCategories = loadedCategories.map((c: any) => ({ name: c.nombre || 'Sin nombre', defaultRate: c.precioHora || 4500, description: 'Nómina agropecuaria' }));
          }
        }
        const loadedLocations = serverMainData.lugares || [];
        const loadedSpecies = serverMainData.especies || [];
        // activities es un objeto { actividad: [subtareas] }: el fallback debe
        // ser {} (con [] el catálogo de actividades quedaba corrupto como array).
        let loadedActivities: Record<string, string[]> = localCatalogs?.activities || {};

        if (serverActData && serverActData.categorias) {
          loadedActivities = serverActData.categorias;
        }

        const mergedCatalogs: MasterCatalogs = {
          categories: loadedCategories,
          locations: loadedLocations,
          species: loadedSpecies,
          activities: loadedActivities
        };

        localStorage.setItem(WORKERS_KEY, JSON.stringify(loadedWorkers));
        localStorage.setItem(CATALOGS_KEY, JSON.stringify(mergedCatalogs));
        localStorage.setItem('bobadilla_config_timestamp', String(serverMainTimestamp));
        
        // Update local variables so subsequent entry sync uses the new config
        localWorkers.length = 0;
        localWorkers.push(...loadedWorkers);
        localCatalogs = mergedCatalogs;
        
        configSynced = true;
      } else if (localConfigTimestamp > serverMainTimestamp) {
        // Upload local configuration (both main and activities rows)
        const timestamp = new Date().toISOString();
        
        await client.from('config_v4').upsert({
          id: 'main',
          workers: localWorkers,
          categorias: localCatalogs.categories,
          lugares: localCatalogs.locations,
          especies: localCatalogs.species,
          periodo_mode: 'semanal',
          app_version: 1,
          updated_at: timestamp
        });

        await client.from('config_v4').upsert({
          id: 'activities',
          categorias: localCatalogs.activities,
          updated_at: timestamp
        });

        configSynced = true;
      }
    } else {
      console.warn('Error reading config_v4 from server:', mainGetError);
    }

    // ----------------------------------------
    // 3. Handle deletions (Soft delete sync based on deleted_entries_v4)
    // ----------------------------------------
    const toDeleteLocally = localEntries.filter(e => e.deleted);
    for (const entry of toDeleteLocally) {
      const numericId = Number(entry.id.replace(/\D/g, ''));
      if (!isNaN(numericId)) {
        // Delete on server
        const { error: deletionError } = await client.from('entries_v4').delete().eq('id', numericId);
        
        if (deletionError) {
          console.warn('Failed to delete on server:', deletionError.message);
          // Si hay error de RLS, simplemente lo ignoramos y no detenemos toda la sincronización.
          // Restauramos el estado local para que no siga intentando infinitamente y bloqueando la vista
          entry.deleted = false;
          continue;
        }

        // Log in server-side deleted_entries_v4 table so other devices delete it
        const { error: delEntryError } = await client.from('deleted_entries_v4').upsert({
          entry_id: numericId,
          deleted_at: new Date().toISOString()
        });

        if (delEntryError) {
          console.warn('Failed to log deletion:', delEntryError.message);
        }
        
        // Audit log for deletion is automatically handled by the database trigger
        deletedCount++;
      }
    }
    
    // Filter out deleted items from local storage
    localEntries = localEntries.filter(e => !e.deleted);

    // ----------------------------------------
    // 4. Download and process deleted list on server FIRST
    // ----------------------------------------
    const { data: serverDeleted, error: delError } = await client
      .from('deleted_entries_v4')
      .select('entry_id, deleted_at');
    
    if (!delError && serverDeleted) {
      const serverDeletedIds = new Set(serverDeleted.map((d: any) => String(d.entry_id)));
      const prevLength = localEntries.length;
      localEntries = localEntries.filter(e => !serverDeletedIds.has(e.id.replace(/\D/g, '')));
      deletedCount += (prevLength - localEntries.length);
    }

    // ----------------------------------------
    // 5. Download server active entries
    // ----------------------------------------
    // Paginado: sin esto Supabase corta en 1000 filas y todo lo que quedaba
    // afuera se consideraba "no existe en el servidor" (re-subidas masivas y
    // merge incompleto hacia local).
    const { rows: serverEntries, error: getError } = await fetchAllEntryRows(client);

    if (getError) {
      console.warn('Error downloading server entries:', getError);
    }

    const serverMap = new Map<string, any>();
    if (serverEntries) {
      for (const s of serverEntries) {
        serverMap.set(String(s.id), s);
      }
    }

    // ----------------------------------------
    // 6. Compare local vs server and identify toUpload
    // ----------------------------------------
    const payloadsToUpload: any[] = [];
    const updatedLocalEntries: Entry[] = [];

    for (const entry of localEntries) {
      let numericId = Number(entry.id.replace(/\D/g, ''));
      if (isNaN(numericId) || numericId === 0 || String(numericId).length > 15) {
        entry.id = generateEntryId();
        numericId = Number(entry.id);
      }
      
      const s = serverMap.get(String(numericId));
      const serverUpdatedAt = s?.created_at ? new Date(s.created_at).getTime() : 0;
      const localUpdatedAt = entry.updated_at ? new Date(entry.updated_at).getTime() : Date.now();

      // If local is strictly newer, or it doesn't exist on server, we upload it
      if (!s || localUpdatedAt > serverUpdatedAt) {
        const dateObj = new Date(entry.date + 'T12:00:00');
        const daysInSpanish = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const monthsInSpanish = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        const dia = daysInSpanish[dateObj.getDay()];
        const mes = dateObj.getMonth() + 1;
        const anio = dateObj.getFullYear();
        const calculatedPeriodo = `${monthsInSpanish[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
        
        const workerObj = localWorkers.find(w => w.id === entry.worker_id);
        const nombre = workerObj?.name || 'Trabajador Desconocido';
        
        const payload = {
          id: numericId,
          fecha: entry.date,
          dia,
          mes,
          anio,
          periodo: calculatedPeriodo,
          tipo: canonicalizeEntryType(entry.type),
          nombre,
          categoria: workerObj?.category || 'Peon General',
          regimen: workerObj?.regime || 'temporal',
          lugar: entry.location || '',
          cuadro: entry.quadro || '',
          especie: entry.specie || '',
          actividad_principal: entry.activity || '',
          trabajo: entry.subtask || '',
          descripcion: entry.notes || entry.paymentMethod || '',
          forma_pago: entry.paymentMethod || null,
          cantidad: Number(entry.quantity || entry.hours || 0),
          unidad: entry.hours > 0 ? 'hs' : 'unid',
          precio_unitario: Number(entry.rate || 0),
          total: Number(entry.amount || 0),
          locked: entry.locked ? true : false,
          created_at: entry.updated_at || new Date().toISOString(),
          created_by: entry.created_by || currentUserObj.id,
          // CAPA 2: clave de idempotencia. Para registros viejos sin uuid usamos
          // `legacy-<id>`, EXACTAMENTE el mismo valor que el backfill SQL, de modo
          // que el servidor los reconozca y nunca los duplique al re-sincronizar.
          client_uuid: entry.client_uuid || ('legacy-' + numericId)
        };
        payloadsToUpload.push(payload);
      }
      // Regardless, keep it in our updated local entries list (to be merged later)
      updatedLocalEntries.push(entry);
    }
    
    localEntries = updatedLocalEntries;

    // Deduplicate payloadsToUpload to prevent ON CONFLICT DO UPDATE error.
    // CAPA 2: deduplicamos por la clave de idempotencia (client_uuid), que es el
    // mismo destino de conflicto del upsert. Así dos cargas del MISMO parte se
    // colapsan en una, pero una colisión real de `id` numérico entre partes
    // DISTINTOS ya no se descarta en silencio (saldría error visible).
    const uniquePayloadsMap = new Map();
    for (const p of payloadsToUpload) {
      uniquePayloadsMap.set(p.client_uuid, p);
    }
    const uniquePayloads = Array.from(uniquePayloadsMap.values());

    // ----------------------------------------
    // 7. Bulk Upsert
    // ----------------------------------------
    let upsertError = null;
    if (uniquePayloads.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < uniquePayloads.length; i += CHUNK_SIZE) {
        const chunk = uniquePayloads.slice(i, i + CHUNK_SIZE);
        // CAPA 2: el conflicto se resuelve por client_uuid (no por id). Si el mismo
        // parte ya existe (mismo uuid), se ACTUALIZA esa fila en vez de crear otra,
        // aunque su id numérico haya cambiado. Requiere el índice único de la migración.
        const { error } = await client.from('entries_v4').upsert(chunk, { onConflict: 'client_uuid' });
        if (error) {
          console.error('Error in bulk upsert:', error);
          upsertError = error;
          // No hacemos throw aquí para permitir que la descarga (merge) ocurra
          break; // Salimos del loop de upsert, pero continuamos con la función
        }
        uploadedCount += chunk.length;
      }
      // Se removió el throw de upsertError de aquí para ponerlo al final
    }

    // ----------------------------------------
    // 8. Merge Server Entries Down to Local
    // ----------------------------------------
    if (serverEntries) {
      const localMap = new Map<string, Entry>(localEntries.map(e => [e.id, e]));

      for (const s of serverEntries) {
        const sIdStr = String(s.id);
        const local = localMap.get(sIdStr);
        const serverUpdatedAt = s.created_at ? new Date(s.created_at).getTime() : 0;
        const localUpdatedAt = local?.updated_at ? new Date(local.updated_at).getTime() : 0;

        // Mapeo centralizado (parseo + resolución a prueba de fallos del worker_id
        // + preservación de created_by). Ver mapServerRowToEntry.
        const parsedEntry: Entry = mapServerRowToEntry(s, localWorkers);

        if (!local) {
          localEntries.push(parsedEntry);
          downloadedCount++;
        } else if (serverUpdatedAt > localUpdatedAt) {
          const idx = localEntries.findIndex(e => e.id === sIdStr);
          if (idx !== -1) {
            localEntries[idx] = parsedEntry;
            downloadedCount++;
          }
        }
      }
    }

    // Write back final entries representing complete sync state
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(localEntries));

    localStorage.setItem(LAST_SYNC_KEY, new Date().toLocaleString());

    if (upsertError) {
      return {
        success: false,
        uploaded: uploadedCount,
        downloaded: downloadedCount,
        deleted: deletedCount,
        configSynced,
        message: `Sincronización parcial: Se descargaron ${downloadedCount} registros, pero falló la subida: ${upsertError.message}`
      };
    }

    return {
      success: true,
      uploaded: uploadedCount,
      downloaded: downloadedCount,
      deleted: deletedCount,
      configSynced,
      message: 'Sincronización bidireccional completada con éxito.'
    };
  } catch (e: any) {
    console.error('Crash during bidirectional sync', e);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      configSynced: false,
      message: `Error al sincronizar: ${e?.message || e || 'Error de conexión'}`
    };
  }
}

// ==========================================
// WhatsApp Integration Methods
// ==========================================

export async function fetchPendingWhatsAppMessages(): Promise<WhatsAppMessage[]> {
  const client = createSupabaseInstance();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('whatsapp_messages')
      .select('*')
      .in('status', ['pendiente', 'error'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching pending WhatsApp messages:', err);
    return [];
  }
}

export async function updateWhatsAppMessageStatus(id: string, newStatus: string): Promise<boolean> {
  const client = createSupabaseInstance();
  if (!client) return false;

  try {
    const { error } = await client
      .from('whatsapp_messages')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`Error updating message ${id} status to ${newStatus}:`, err);
    return false;
  }
}
