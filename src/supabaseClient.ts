import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Entry, DeletedEntry, Worker, MasterCatalogs, WhatsAppMessage } from './types';
import { checkAppVersion } from './versionCheck';

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

export async function getCurrentSupabaseUser(): Promise<SupabaseUser | null> {
  const client = createSupabaseInstance();
  if (!client) return null;
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return {
      id: user.id,
      email: user.email,
      role: String(user.user_metadata?.role || (user as any).raw_user_meta_data?.role || 'visor')
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
        role: String(user.user_metadata?.role || (user as any).raw_user_meta_data?.role || 'visor')
      }
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error inesperado de red.' };
  }
}

export async function registerSupabaseUser(email: string, password: string, role: 'admin' | 'encargado' | 'visor'): Promise<{ success: boolean; message: string }> {
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
        const loadedCategories = serverMainData.categorias || [];
        const loadedLocations = serverMainData.lugares || [];
        const loadedSpecies = serverMainData.especies || [];
        let loadedActivities = localCatalogs?.activities || [];

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
          if (deletionError.message.includes('row-level security') || deletionError.message.includes('permission denied') || deletionError.message.includes('violates row-level security')) {
            throw new Error(`Permisos insuficientes para eliminar el registro #${numericId}. Se requiere el rol de Administrador ('admin') según las políticas RLS activas.`);
          }
          throw new Error(`Error del servidor al eliminar: ${deletionError.message}`);
        }

        // Log in server-side deleted_entries_v4 table so other devices delete it
        const { error: delEntryError } = await client.from('deleted_entries_v4').upsert({
          entry_id: numericId,
          deleted_at: new Date().toISOString()
        });

        if (delEntryError) {
          if (delEntryError.message.includes('row-level security') || delEntryError.message.includes('permission denied')) {
            throw new Error(`Sincronización rechazada por políticas RLS. Asegúrese de estar autenticado con rol habilitado.`);
          }
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
    const { data: serverEntries, error: getError } = await client
      .from('entries_v4')
      .select('*');

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
        numericId = Date.now() * 10 + Math.floor(Math.random() * 10);
        entry.id = String(numericId);
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
          tipo: entry.type,
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
          created_at: entry.updated_at || new Date().toISOString(),
          created_by: entry.created_by || currentUserObj.id
        };
        payloadsToUpload.push(payload);
      }
      // Regardless, keep it in our updated local entries list (to be merged later)
      updatedLocalEntries.push(entry);
    }
    
    localEntries = updatedLocalEntries;

    // Deduplicate payloadsToUpload to prevent ON CONFLICT DO UPDATE error
    const uniquePayloadsMap = new Map();
    for (const p of payloadsToUpload) {
      // If a duplicate ID is found, the later one in the array (most recent iteration) wins
      uniquePayloadsMap.set(p.id, p);
    }
    const uniquePayloads = Array.from(uniquePayloadsMap.values());

    // ----------------------------------------
    // 7. Bulk Upsert
    // ----------------------------------------
    if (uniquePayloads.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < uniquePayloads.length; i += CHUNK_SIZE) {
        const chunk = uniquePayloads.slice(i, i + CHUNK_SIZE);
        const { error } = await client.from('entries_v4').upsert(chunk);
        if (error) {
          console.error('Error in bulk upsert:', error);
          if (error.message.includes('row-level security') || error.message.includes('permission denied') || error.message.includes('violates row-level security')) {
            throw new Error('Sincronización rechazada por políticas RLS. Inicie sesión con un usuario habilitado.');
          }
          throw new Error(`Error de subida masiva: ${error.message}`);
        }
        uploadedCount += chunk.length;
      }
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

        if (!worker_id && s.nombre) {
          const matchedWorker = localWorkers.find(w => w.name.toLowerCase().trim() === s.nombre.toLowerCase().trim());
          if (matchedWorker) {
            worker_id = matchedWorker.id;
          } else {
            const newWorkerId = 'w_' + Math.random().toString(36).substring(2, 9);
            const newWorker: Worker = {
              id: newWorkerId,
              name: s.nombre,
              category: s.categoria || 'Peon General',
              regime: (s.regimen as any) || 'temporal',
              hourlyRate: Number(s.precio_unitario || 12),
              isActive: true,
              legajo: '#GEN' + Math.floor(Math.random() * 1000)
            };
            localWorkers.push(newWorker);
            worker_id = newWorkerId;
            localStorage.setItem(WORKERS_KEY, JSON.stringify(localWorkers));
            localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
          }
        }

        const parsedEntry: Entry = {
          id: sIdStr,
          worker_id: worker_id || 'w1',
          date: s.fecha,
          type: s.tipo,
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
          updated_at: s.created_at
        };

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
