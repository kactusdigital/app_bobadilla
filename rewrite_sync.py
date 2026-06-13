import re

with open("src/supabaseClient.ts", "r") as f:
    content = f.read()

# Remove the logAuditAction('DELETE'...)
content = content.replace(
    "await logAuditAction('DELETE', 'entries_v4', String(numericId), entry, null);",
    "// Audit is handled by DB trigger"
)

old_logic_pattern = re.compile(
    r"// ----------------------------------------\n\s*// 4\. Process remaining local changes.*?// Write back final entries representing complete sync state",
    re.DOTALL
)

new_logic = """// ----------------------------------------
    // 4. Download server active entries FIRST
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
    // 5. Compare local vs server and identify toUpload
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

    // ----------------------------------------
    // 6. Bulk Upsert
    // ----------------------------------------
    if (payloadsToUpload.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < payloadsToUpload.length; i += CHUNK_SIZE) {
        const chunk = payloadsToUpload.slice(i, i + CHUNK_SIZE);
        const { error } = await client.from('entries_v4').upsert(chunk);
        if (error) {
          console.error('Error in bulk upsert:', error);
          if (error.message.includes('row-level security') || error.message.includes('permission denied')) {
            throw new Error('Sincronización rechazada por RLS. Inicie sesión.');
          }
          throw new Error(`Error de subida masiva: ${error.message}`);
        }
        uploadedCount += chunk.length;
      }
    }

    // ----------------------------------------
    // 7. Download and process deleted list on server
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
            const newWorker = {
              id: newWorkerId,
              name: s.nombre,
              category: s.categoria || 'Peon General',
              regime: (s.regimen) || 'temporal',
              hourlyRate: Number(s.precio_unitario || 12),
              isActive: true,
              legajo: '#GEN' + Math.floor(Math.random() * 1000)
            };
            localWorkers.push(newWorker);
            worker_id = newWorkerId;
            localStorage.setItem("bobadilla_workers", JSON.stringify(localWorkers));
            localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
          }
        }

        const parsedEntry = {
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

    // Write back final entries representing complete sync state"""

new_content, count = old_logic_pattern.subn(new_logic, content)
print(f"Replaced {count} instances")

with open("src/supabaseClient.ts", "w") as f:
    f.write(new_content)
