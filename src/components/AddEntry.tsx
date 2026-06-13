import React, { useState, useMemo } from 'react';
import { Worker, Entry, MasterCatalogs } from '../types';
import { CheckCircle, Save, Loader2, ArrowLeft, Search, Filter, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AddEntryProps {
  workers: Worker[];
  catalogs: MasterCatalogs;
  onAddEntries: (newEntries: Entry[]) => void;
  onNavigate: (view: string) => void;
}

export default function AddEntry({ workers, catalogs, onAddEntries, onNavigate }: AddEntryProps) {
  // Step Management
  const [step, setStep] = useState<1 | 2>(1);

  // --- Step 1 State ---
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [type, setType] = useState('Trabajos al día');
  
  // Filters for Step 1
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [filterRegime, setFilterRegime] = useState('Todos');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);

  // --- Step 2 State ---
  // Template State
  const [showTemplate, setShowTemplate] = useState(false);
  const [tplLocation, setTplLocation] = useState('');
  const [tplQuadro, setTplQuadro] = useState('');
  const [tplSpecie, setTplSpecie] = useState('');
  const [tplActivity, setTplActivity] = useState('');
  const [tplSubtask, setTplSubtask] = useState('');
  const [tplRate, setTplRate] = useState<number | ''>('');
  const [tplQuantity, setTplQuantity] = useState<number | ''>('');

  // Individual Form States
  const [forms, setForms] = useState<Record<string, any>>({});
  
  const [isSaving, setIsSaving] = useState(false);

  // Derived lists
  const categories = useMemo(() => ['Todas', ...Array.from(new Set(workers.map(w => w.category)))], [workers]);

  const activeWorkers = useMemo(() => {
    return workers.filter(w => {
      if (!w.isActive) return false;
      if (filterCategory !== 'Todas' && w.category !== filterCategory) return false;
      if (filterRegime !== 'Todos' && w.regime !== filterRegime) return false;
      if (searchTerm && !w.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [workers, filterCategory, filterRegime, searchTerm]);

  // Determine field visibility based on Type
  const isHoursType = ['Trabajos al día', 'Feriado', 'Trabajos Tercerizados'].includes(type);
  const isDaysType = ['Parte de Enfermo', 'Licencia', 'Vacaciones'].includes(type);
  const isAdvanceType = ['Adelanto', 'Descuento', 'Bonificación'].includes(type);
  const isActivityType = ['Trabajos al día', 'Trabajos al tanto', 'Injertación', 'Trabajos Tercerizados'].includes(type);

  const handleNextStep = () => {
    if (selectedWorkers.length === 0) {
      alert('Debe seleccionar al menos un trabajador.');
      return;
    }
    
    // Initialize forms for selected workers
    const newForms: Record<string, any> = {};
    selectedWorkers.forEach(wId => {
      newForms[wId] = forms[wId] || {
        location: catalogs.locations[0] || '',
        quadro: '',
        specie: catalogs.species[0] || '',
        activity: isActivityType ? (Object.keys(catalogs.activities)[0] || '') : '',
        subtask: '',
        quantity: isDaysType ? 1 : (isHoursType ? 8 : 10),
        amount: 0,
        rate: catalogs.categories.find(c => c.name === workers.find(w => w.id === wId)?.category)?.defaultRate || 4000,
        notes: '',
        paymentMethod: 'efectivo'
      };
    });
    setForms(newForms);
    setStep(2);
  };

  const applyTemplate = () => {
    const newForms = { ...forms };
    selectedWorkers.forEach(wId => {
      if (tplLocation) newForms[wId].location = tplLocation;
      if (tplQuadro) newForms[wId].quadro = tplQuadro;
      if (tplSpecie) newForms[wId].specie = tplSpecie;
      if (tplActivity) {
        newForms[wId].activity = tplActivity;
        newForms[wId].subtask = tplSubtask;
      }
      if (tplQuantity !== '') newForms[wId].quantity = Number(tplQuantity);
      if (tplRate !== '') newForms[wId].rate = Number(tplRate);
    });
    setForms(newForms);
  };

  const handleUpdateForm = (wId: string, field: string, value: any) => {
    setForms(prev => ({
      ...prev,
      [wId]: { ...prev[wId], [field]: value }
    }));
  };

  const handleSubmit = async () => {
    setIsSaving(true);

    const newEntries: Entry[] = selectedWorkers.map(wId => {
      const workerInfo = workers.find(w => w.id === wId);
      const f = forms[wId];
      
      const appliedRate = Number(f.rate) || workerInfo?.hourlyRate || 4000;
      
      let calculatedAmount = Number(f.amount) || 0;
      if (!isAdvanceType) {
        calculatedAmount = Number(f.quantity || 0) * appliedRate;
      }
      
      // If it's Descuento or Adelanto, they are usually negative (or treated specially in reporting)
      // The demo logic: isNegative ? -monto : monto
      const isNegative = ['Adelanto', 'Descuento'].includes(type);
      if (isNegative && calculatedAmount > 0) {
        calculatedAmount = -calculatedAmount;
      }

      return {
        id: String(Date.now() * 10 + Math.floor(Math.random() * 10)),
        worker_id: wId,
        date,
        type,
        location: isAdvanceType ? '' : f.location,
        quadro: isAdvanceType ? '' : f.quadro,
        specie: isAdvanceType ? '' : f.specie,
        activity: isActivityType ? f.activity : '',
        subtask: isActivityType ? f.subtask : '',
        notes: f.notes,
        paymentMethod: f.paymentMethod,
        hours: isHoursType ? Number(f.quantity || 0) : 0,
        quantity: !isHoursType && !isAdvanceType ? Number(f.quantity || 0) : 0,
        amount: isAdvanceType ? (isNegative ? -Number(f.amount || 0) : Number(f.amount || 0)) : calculatedAmount,
        rate: isAdvanceType ? (isNegative ? -Number(f.amount || 0) : Number(f.amount || 0)) : appliedRate,
        updated_at: new Date().toISOString()
      };
    });

    setTimeout(() => {
      onAddEntries(newEntries);
      setIsSaving(false);
      onNavigate('entries');
    }, 800);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white border border-[#c0c9bb]/50 p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-bold text-[#00450d] mb-4">Paso 1: Configurar Parte</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#717a6d] uppercase">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-12 px-4 rounded-xl border border-[#c0c9bb] bg-[#f9f9f9] text-sm focus:border-[#00450d] outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#717a6d] uppercase">Tipo de Registro</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-12 px-4 rounded-xl border border-[#c0c9bb] bg-[#f9f9f9] text-sm font-bold focus:border-[#00450d] outline-none"
                >
                  <option value="Trabajos al día">Trabajos al día (hs)</option>
                  <option value="Trabajos al tanto">Trabajos al tanto (unid)</option>
                  <option value="Injertación">Injertación (unid)</option>
                  <option value="Adelanto">Adelanto (monto)</option>
                  <option value="Descuento">Descuento (monto)</option>
                  <option value="Parte de Enfermo">Parte de Enfermo (días)</option>
                  <option value="Licencia">Licencia (días)</option>
                  <option value="Vacaciones">Vacaciones (días)</option>
                  <option value="Bonificación">Bonificación (monto)</option>
                  <option value="Feriado">Feriado (hs)</option>
                  <option value="Trabajos Tercerizados">Trabajos Tercerizados</option>
                </select>
              </div>
            </div>

            <div className="border-t border-[#c0c9bb]/30 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-sm text-[#1a1c1c] uppercase">Seleccionar Personal</h3>
                <span className="text-xs bg-[#f3f3f3] px-3 py-1 rounded-full font-bold text-[#006e1c]">
                  {selectedWorkers.length} seleccionados
                </span>
              </div>

              {/* Step 1 Filters */}
              <div className="flex flex-wrap gap-3 mb-4 bg-[#f9f9f9] p-3 rounded-xl border border-[#c0c9bb]/30">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-[#717a6d]" />
                  <input
                    type="text"
                    placeholder="Buscar trabajador..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 text-xs border border-[#c0c9bb] rounded-lg outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#717a6d]" />
                  <select 
                    value={filterCategory} 
                    onChange={e => setFilterCategory(e.target.value)}
                    className="h-10 px-2 text-xs border border-[#c0c9bb] rounded-lg outline-none"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select 
                    value={filterRegime} 
                    onChange={e => setFilterRegime(e.target.value)}
                    className="h-10 px-2 text-xs border border-[#c0c9bb] rounded-lg outline-none"
                  >
                    <option value="Todos">Todos</option>
                    <option value="temporal">Temporal</option>
                    <option value="permanente">Permanente</option>
                    <option value="mensualizado">Mensualizado</option>
                  </select>
                </div>
              </div>

              {/* Workers Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-80 overflow-y-auto p-1">
                {activeWorkers.map(w => {
                  const isSelected = selectedWorkers.includes(w.id);
                  return (
                    <div 
                      key={w.id}
                      onClick={() => setSelectedWorkers(prev => 
                        isSelected ? prev.filter(id => id !== w.id) : [...prev, w.id]
                      )}
                      className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-[#006e1c] bg-[#98f994]/20' 
                          : 'border-[#c0c9bb]/50 bg-white hover:border-[#006e1c]/40'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-[#f3f3f3] text-[#717a6d]">
                          {w.regime}
                        </span>
                        {isSelected && <CheckCircle className="w-4 h-4 text-[#006e1c]" />}
                      </div>
                      <span className="font-bold text-xs text-[#1a1c1c] leading-tight">{w.name}</span>
                      <span className="text-[10px] text-[#717a6d] mt-1">{w.category}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleNextStep}
                className="w-full py-3.5 bg-[#00450d] hover:bg-[#002203] text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
              >
                Siguiente Paso <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-white border border-[#c0c9bb]/50 p-6 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#00450d] mb-1">Paso 2: Detalles de Carga</h2>
              <p className="text-xs font-semibold text-[#717a6d] flex items-center gap-2">
                <span className="bg-[#f3f3f3] px-2 py-1 rounded">{date}</span> 
                <span className="bg-[#98f994]/40 text-[#005313] px-2 py-1 rounded">{type}</span>
              </p>
            </div>
            <button 
              onClick={() => setStep(1)}
              className="px-4 py-2 bg-[#f3f3f3] hover:bg-[#e2e2e2] text-[#1a1c1c] text-xs font-bold rounded-lg flex items-center gap-2 transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>
          </div>

          <div className="bg-white border border-[#c0c9bb]/50 p-5 rounded-2xl shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm text-[#1a1c1c]">Plantilla Rápida</h3>
              <button 
                onClick={() => setShowTemplate(!showTemplate)}
                className="text-xs font-bold text-[#006e1c] border-2 border-[#006e1c] px-3 py-1.5 rounded-lg hover:bg-[#98f994]/20"
              >
                {showTemplate ? 'Ocultar Plantilla' : 'Mostrar Plantilla'}
              </button>
            </div>
            
            {showTemplate && (
              <div className="bg-[#f9f9f9] border border-[#c0c9bb]/40 p-4 rounded-xl space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {isActivityType && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#717a6d] uppercase">Lugar</label>
                        <select value={tplLocation} onChange={e => setTplLocation(e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md">
                          <option value="">--</option>
                          {catalogs.locations.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#717a6d] uppercase">Cuadro</label>
                        <input value={tplQuadro} onChange={e => setTplQuadro(e.target.value)} placeholder="Ej: 43" className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#717a6d] uppercase">ESPECIE / VARIEDAD</label>
                        <select value={tplSpecie} onChange={e => setTplSpecie(e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md">
                          <option value="">--</option>
                          {catalogs.species.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  {isActivityType && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#717a6d] uppercase">Actividad</label>
                        <select value={tplActivity} onChange={e => { setTplActivity(e.target.value); setTplSubtask(''); }} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md">
                          <option value="">--</option>
                          {Object.keys(catalogs.activities).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#717a6d] uppercase">Trabajo / Sub-tarea</label>
                        <select value={tplSubtask} onChange={e => setTplSubtask(e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md">
                          <option value="">--</option>
                          {tplActivity && catalogs.activities[tplActivity]?.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[#717a6d] uppercase">
                      {isAdvanceType ? 'Monto ($)' : isDaysType ? 'Días' : isHoursType ? 'Cantidad (Horas)' : 'Cantidad (Unidades)'}
                    </label>
                    <input type="number" step="0.5" value={tplQuantity} onChange={e => setTplQuantity(e.target.value ? Number(e.target.value) : '')} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md" />
                  </div>
                  {!isAdvanceType && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#717a6d] uppercase">Precio ($/hs o $/u)</label>
                      <input type="number" step="100" value={tplRate} onChange={e => setTplRate(e.target.value ? Number(e.target.value) : '')} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md" />
                    </div>
                  )}
                </div>
                <button onClick={applyTemplate} className="w-full py-2 bg-[#006e1c] text-white text-xs font-bold rounded-lg">
                  Aplicar a todos
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {selectedWorkers.map(wId => {
              const w = workers.find(x => x.id === wId);
              const f = forms[wId] || {};
              if (!w) return null;

              return (
                <div key={w.id} className="bg-white border border-[#c0c9bb]/60 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between mb-3 border-b border-[#c0c9bb]/20 pb-2">
                    <span className="font-bold text-sm text-[#00450d]">{w.name}</span>
                    <span className="text-[10px] text-[#717a6d] bg-[#f3f3f3] px-2 py-0.5 rounded">{w.regime}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {isAdvanceType ? (
                      <>
                        <div className="flex flex-col gap-1 md:col-span-2">
                          <label className="text-[10px] font-bold text-[#717a6d] uppercase">Monto ($)</label>
                          <input type="number" value={f.amount} onChange={e => handleUpdateForm(wId, 'amount', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none" />
                        </div>
                      </>
                    ) : (
                      <>
                        {isActivityType && (
                          <>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[#717a6d] uppercase">Lugar</label>
                              <select value={f.location} onChange={e => handleUpdateForm(wId, 'location', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none">
                                <option value="">--</option>
                                {catalogs.locations.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[#717a6d] uppercase">Cuadro</label>
                              <input type="text" value={f.quadro} onChange={e => handleUpdateForm(wId, 'quadro', e.target.value)} placeholder="Opcional" className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[#717a6d] uppercase">ESPECIE / VARIEDAD</label>
                              <select value={f.specie} onChange={e => handleUpdateForm(wId, 'specie', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none">
                                <option value="">--</option>
                                {catalogs.species.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[#717a6d] uppercase">Actividad</label>
                              <select value={f.activity} onChange={e => { handleUpdateForm(wId, 'activity', e.target.value); handleUpdateForm(wId, 'subtask', ''); }} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none font-semibold">
                                <option value="">--</option>
                                {Object.keys(catalogs.activities).map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[#717a6d] uppercase">Trabajo / Sub-tarea</label>
                              <select value={f.subtask} onChange={e => handleUpdateForm(wId, 'subtask', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none font-semibold">
                                <option value="">--</option>
                                {f.activity && catalogs.activities[f.activity]?.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#717a6d] uppercase">{isDaysType ? 'Días' : isHoursType ? 'Horas' : 'Cant/Unid'}</label>
                          <input type="number" step="0.5" value={f.quantity} onChange={e => handleUpdateForm(wId, 'quantity', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none font-bold" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-[#717a6d] uppercase">Precio Unitario ($)</label>
                          <input type="number" step="100" value={f.rate} onChange={e => handleUpdateForm(wId, 'rate', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none" />
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="text-[10px] font-bold text-[#717a6d] uppercase">Forma de Pago</label>
                      <select value={f.paymentMethod} onChange={e => handleUpdateForm(wId, 'paymentMethod', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none">
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="text-[10px] font-bold text-[#717a6d] uppercase">Descripción (opcional)</label>
                      <input type="text" value={f.notes} onChange={e => handleUpdateForm(wId, 'notes', e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-md focus:border-[#00450d] outline-none" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="w-full py-4 bg-[#00450d] hover:bg-[#002203] text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 uppercase"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? 'Guardando...' : 'Guardar Parte Diario'}
          </button>
        </div>
      )}
    </div>
  );
}
