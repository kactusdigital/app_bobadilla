import React, { useState, useEffect } from 'react';
import { Check, X, Edit, MessageSquare, AlertCircle } from 'lucide-react';
import { WhatsAppMessage, Entry, Worker, MasterCatalogs, localDateStr } from '../types';
import { fetchPendingWhatsAppMessages, updateWhatsAppMessageStatus, generateEntryId } from '../supabaseClient';

interface Props {
  onAddEntries: (entries: Entry[]) => void;
  workers: Worker[];
  catalogs: MasterCatalogs;
}

export function WhatsAppMessages({ onAddEntries, workers, catalogs }: Props) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMsg, setEditingMsg] = useState<WhatsAppMessage | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState<any>({});

  const loadMessages = async () => {
    setLoading(true);
    const data = await fetchPendingWhatsAppMessages();
    setMessages(data);
    setLoading(false);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleReject = async (id: string) => {
    if (window.confirm('¿Seguro que deseas rechazar y ocultar este mensaje?')) {
      const success = await updateWhatsAppMessageStatus(id, 'rechazado');
      if (success) {
        setMessages(prev => prev.filter(m => m.id !== id));
      } else {
        alert('Error al rechazar el mensaje.');
      }
    }
  };

  const parsePayloadToEntry = (payload: any): Entry | null => {
    // Find worker ID
    const workerName = payload.nombre;
    const worker = workers.find(w => w.name.toLowerCase() === workerName?.toLowerCase());
    
    if (!worker) return null; // We need a valid worker ID

    let rate = worker.hourlyRate || 4000;
    let qty = Number(payload.cantidad) || 0;
    
    // Auto-calculate amount if normal hourly work
    let amount = 0;
    if (payload.tipo !== 'Adelanto' && payload.tipo !== 'Descuento') {
       amount = rate * qty;
    } else {
       amount = qty; // If it's adelanto/descuento, the 'cantidad' might be the money amount
    }

    return {
      id: generateEntryId(),
      worker_id: worker.id,
      date: payload.fecha || localDateStr(),
      type: payload.tipo || 'Trabajos al día',
      location: payload.lugar || '',
      quadro: payload.cuadro || '',
      specie: payload.especie || '',
      activity: payload.actividad_principal || payload.trabajo || '',
      hours: payload.tipo === 'Trabajos al día' ? qty : 0,
      quantity: payload.tipo !== 'Trabajos al día' ? qty : 0,
      amount: amount,
      rate: rate,
      created_by: 'whatsapp-webhook'
    };
  };

  const handleConfirm = async (msg: WhatsAppMessage, overridePayload?: any) => {
    const payload = overridePayload || msg.payload_extraido;
    
    // Support array of records
    const payloads = Array.isArray(payload) ? payload : [payload];
    
    const newEntries: Entry[] = [];
    for (const p of payloads) {
      const entry = parsePayloadToEntry(p);
      if (!entry) {
        alert(`No se pudo enlazar el trabajador "${p.nombre}". Por favor, usa el botón Editar para seleccionar uno correcto.`);
        return;
      }
      newEntries.push(entry);
    }

    // Insert locally
    onAddEntries(newEntries);

    // Update in Supabase
    const success = await updateWhatsAppMessageStatus(msg.id, 'confirmado');
    if (success) {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      if (editingMsg?.id === msg.id) setEditingMsg(null);
    } else {
      alert('Error al actualizar el estado en el servidor.');
    }
  };

  const openEdit = (msg: WhatsAppMessage) => {
    // For simplicity in this UI, if it's an array, we take the first element to edit
    // (A full production app might want to render multiple forms)
    const payload = Array.isArray(msg.payload_extraido) ? msg.payload_extraido[0] : msg.payload_extraido;
    setEditForm({ ...payload });
    setEditingMsg(msg);
  };

  const saveEdit = () => {
    if (!editingMsg) return;
    // Overwrite the payload with edited form
    handleConfirm(editingMsg, editForm);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-[#717a6d]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006e1c] mx-auto mb-4"></div>
        <p>Cargando mensajes pendientes...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#002203]">Bandeja de WhatsApp</h2>
          <p className="text-sm text-[#717a6d] mt-1">Revisa y confirma los reportes enviados por audio.</p>
        </div>
        <div className="bg-[#e2e2e2]/50 px-4 py-2 rounded-xl border border-[#c0c9bb]/30">
          <span className="font-bold text-[#1a1c1c]">{messages.length}</span> pendientes
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#c0c9bb]/65 p-12 text-center shadow-sm">
          <MessageSquare className="w-12 h-12 text-[#c0c9bb] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#1a1c1c]">No hay mensajes pendientes</h3>
          <p className="text-sm text-[#717a6d] mt-2">Todos los reportes de WhatsApp han sido procesados.</p>
          <button 
            onClick={loadMessages}
            className="mt-6 px-4 py-2 bg-[#f3f3f3] hover:bg-[#e2e2e2] rounded-lg text-sm font-bold transition-colors"
          >
            Actualizar
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {messages.map(msg => (
            <div key={msg.id} className={`bg-white rounded-2xl border ${msg.status === 'error' ? 'border-[#ba1a1a]/50' : 'border-[#c0c9bb]/65'} shadow-sm overflow-hidden flex flex-col md:flex-row`}>
              {/* Left Column: Info & Audio Transcription */}
              <div className={`p-5 flex-1 border-b md:border-b-0 md:border-r border-[#c0c9bb]/30 ${msg.status === 'error' ? 'bg-[#fff0f0]' : 'bg-[#f8faf8]'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${msg.status === 'error' ? 'bg-[#ffdad6] text-[#ba1a1a]' : 'bg-[#d3e8d1] text-[#0c7521]'}`}>
                    {msg.status === 'error' ? 'Error IA' : 'WhatsApp'}
                  </span>
                  <span className="text-xs text-[#717a6d]">{new Date(msg.created_at).toLocaleString()}</span>
                  <span className="text-xs text-[#717a6d] ml-auto">De: {msg.telefono_origen}</span>
                </div>
                <div className="relative">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-full ${msg.status === 'error' ? 'bg-[#ba1a1a]' : 'bg-[#98f994]'}`}></div>
                  <p className="pl-3 text-sm text-[#1a1c1c] italic">
                    "{msg.transcription || 'Sin transcripción (Solo texto extraído)'}"
                  </p>
                </div>
              </div>

              {/* Right Column: Extracted Data */}
              <div className="p-5 flex-1 flex flex-col justify-between bg-white">
                <div>
                  <h4 className="text-xs font-bold text-[#717a6d] uppercase tracking-wider mb-3">Datos Extraídos</h4>
                  
                  {msg.status === 'error' ? (
                    <div className="text-sm text-[#ba1a1a] flex items-center gap-1.5 mb-2">
                      <AlertCircle className="w-4 h-4" /> La IA falló procesando este registro.
                    </div>
                  ) : Array.isArray(msg.payload_extraido) ? (
                    <div className="text-sm text-[#ba1a1a] flex items-center gap-1.5 mb-2">
                      <AlertCircle className="w-4 h-4" /> Contiene múltiples registros. Se insertarán todos.
                    </div>
                  ) : null}

                  <div className="bg-[#f3f3f3] rounded-lg p-3 text-xs font-mono overflow-auto max-h-32 mb-4 text-[#1a1c1c]">
                    <pre>{JSON.stringify(msg.payload_extraido || { error: "No hay datos estructurados" }, null, 2)}</pre>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[#c0c9bb]/30">
                  {msg.status !== 'error' && (
                    <button 
                      onClick={() => handleConfirm(msg)}
                      className="flex-1 py-2 bg-[#006e1c] hover:bg-[#005213] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Check className="w-4 h-4" /> Confirmar
                    </button>
                  )}
                  {msg.status !== 'error' && (
                    <button 
                      onClick={() => openEdit(msg)}
                      className="flex-1 py-2 bg-[#e2e2e2] hover:bg-[#c0c9bb] text-[#1a1c1c] text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Edit className="w-4 h-4" /> Editar
                    </button>
                  )}
                  <button 
                    onClick={() => handleReject(msg.id)}
                    className="flex-1 py-2 px-3 bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#ba1a1a] text-xs font-bold rounded-lg flex items-center justify-center transition-colors"
                    title="Descartar"
                  >
                    <X className="w-4 h-4" /> {msg.status === 'error' ? 'Descartar Error' : ''}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-black text-[#1a1c1c] mb-4">Editar Registro Extraído</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#717a6d] mb-1">Trabajador</label>
                <select 
                  className="w-full p-2.5 bg-[#f3f3f3] border-none rounded-xl text-sm"
                  value={editForm.nombre || ''}
                  onChange={e => setEditForm({...editForm, nombre: e.target.value})}
                >
                  <option value="">Seleccionar...</option>
                  {workers.filter(w => w.isActive).map(w => (
                    <option key={w.id} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#717a6d] mb-1">Fecha</label>
                  <input 
                    type="date"
                    className="w-full p-2.5 bg-[#f3f3f3] border-none rounded-xl text-sm"
                    value={editForm.fecha || ''}
                    onChange={e => setEditForm({...editForm, fecha: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#717a6d] mb-1">Tipo</label>
                  <select 
                    className="w-full p-2.5 bg-[#f3f3f3] border-none rounded-xl text-sm"
                    value={editForm.tipo || 'Trabajos al día'}
                    onChange={e => setEditForm({...editForm, tipo: e.target.value})}
                  >
                    <option>Trabajos al día</option>
                    <option>Trabajos al tanto</option>
                    <option>Injertación</option>
                    <option>Adelanto</option>
                    <option>Descuento</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#717a6d] mb-1">Actividad</label>
                  <input 
                    type="text"
                    className="w-full p-2.5 bg-[#f3f3f3] border-none rounded-xl text-sm"
                    value={editForm.actividad_principal || editForm.trabajo || ''}
                    onChange={e => setEditForm({...editForm, actividad_principal: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#717a6d] mb-1">Cantidad (Hs / $)</label>
                  <input 
                    type="number"
                    className="w-full p-2.5 bg-[#f3f3f3] border-none rounded-xl text-sm"
                    value={editForm.cantidad || ''}
                    onChange={e => setEditForm({...editForm, cantidad: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setEditingMsg(null)}
                className="flex-1 py-3 bg-[#f3f3f3] text-[#1a1c1c] font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button 
                onClick={saveEdit}
                className="flex-1 py-3 bg-[#00450d] text-white font-bold rounded-xl"
              >
                Confirmar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
