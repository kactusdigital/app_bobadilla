import React, { useState, useMemo } from 'react';
import { Entry, Worker, MasterCatalogs, formatCurrency, localDateStr } from '../types';
import { Search, Filter, Trash2, Edit2, ChevronLeft, ChevronRight, CheckCircle, Info, Calendar, MoreHorizontal, X, FileEdit, Lock, Download, RefreshCw } from 'lucide-react';
import { performBidirectionalSync } from '../supabaseClient';

interface EntriesProps {
  entries: Entry[];
  workers: Worker[];
  catalogs: MasterCatalogs;
  onUpdateEntry: (id: string, updated: Partial<Entry>) => void;
  onDeleteEntry: (id: string) => void;
  userRole?: string;
  currentUserId?: string;
}

export default function Entries({ entries, workers, catalogs, onUpdateEntry, onDeleteEntry, userRole, currentUserId }: EntriesProps) {
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('Este mes');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('Todos');
  const [filterType, setFilterType] = useState('Todos');
  const [filterFormaPago, setFilterFormaPago] = useState('Todos');
  const [filterRegime, setFilterRegime] = useState('Todos');
  const [filterCategory, setFilterCategory] = useState('Todas');
  
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    const result = await performBidirectionalSync();
    setIsSyncing(false);
    if (result.success) {
      alert(`¡Sincronización exitosa!\nSubidos: ${result.uploaded}\nDescargados: ${result.downloaded}`);
      window.location.reload();
    } else {
      alert(`Mensaje de sincronización: ${result.message}`);
      window.location.reload();
    }
  };

  // Edit Modal State
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editFormData, setEditFormData] = useState({
    worker_id: '',
    date: '',
    type: '',
    location: '',
    quadro: '',
    specie: '',
    activity: '',
    subtask: '',
    hours: 0,
    quantity: 0,
    amount: 0,
    rate: 0
  });

  // Client Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Reset Filters
  const handleClearFilters = () => {
    if (confirm('¿Está seguro de que desea restablecer todos los filtros actuales?')) {
      setSearchTerm('');
      setFilterPeriod('Este mes');
      setFilterDateFrom('');
      setFilterDateTo('');
      setFilterWorkerId('Todos');
      setFilterType('Todos');
      setFilterFormaPago('Todos');
      setFilterRegime('Todos');
      setFilterCategory('Todas');
      setCurrentPage(1);
    }
  };

  // Índice por id para no recorrer la lista de trabajadores por cada registro
  const workerById = useMemo(() => new Map(workers.map(w => [w.id, w])), [workers]);

  // Filter Logic
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (e.deleted) return false;

      // ROLES: SÓLO el rol 'encargado' (empleado de campo) tiene visibilidad
      // restringida a sus propios registros. Dirección, administración y visor
      // ven SIEMPRE el 100% de los registros. Cualquier otro rol no reconocido
      // NO se restringe: jamás ocultamos datos por un rol ambiguo.
      if (userRole === 'encargado' && e.created_by !== currentUserId) {
        return false;
      }

      // 1. Text Search on Location, activity, or worker initials
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const workerName = workerById.get(e.worker_id)?.name.toLowerCase() || '';
        const act = e.activity.toLowerCase();
        const loc = e.location.toLowerCase();
        const quad = e.quadro.toLowerCase();
        const spec = e.specie.toLowerCase();
        if (!workerName.includes(query) && !act.includes(query) && !loc.includes(query) && !quad.includes(query) && !spec.includes(query)) {
          return false;
        }
      }

      // 2. Filter by Worker
      if (filterWorkerId !== 'Todos' && e.worker_id !== filterWorkerId) {
        return false;
      }

      // NUNCA ocultamos un registro porque no se encuentre su trabajador.
      // Si el worker no existe localmente (fallo de sincronización), el registro
      // igual se muestra en la tabla con una etiqueta roja de advertencia.
      const worker = workerById.get(e.worker_id);

      // 3. Filter by Type
      if (filterType !== 'Todos' && e.type !== filterType) {
        return false;
      }

      // 3.2 Filter by Forma de Pago (antes el selector existía pero no filtraba nada)
      if (filterFormaPago !== 'Todos' && (e.paymentMethod || '').toLowerCase() !== filterFormaPago.toLowerCase()) {
        return false;
      }

      // 3.5 Filter by Regime (sólo descarta si hay un filtro específico activo;
      // los registros con trabajador desconocido permanecen visibles por defecto)
      if (filterRegime !== 'Todos' && worker?.regime !== filterRegime) {
        return false;
      }

      // 3.8 Filter by Category (mismo criterio que el régimen)
      if (filterCategory !== 'Todas' && worker?.category !== filterCategory) {
        return false;
      }

      // 4. Date Period Filters
      const entryDate = new Date(e.date + 'T00:00:00');
      const now = new Date();

      if (filterPeriod === 'Este mes') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (entryDate < firstDay || entryDate > lastDay) return false;
      } else if (filterPeriod === 'Últimos 3 meses') {
        const boundary = new Date();
        boundary.setMonth(boundary.getMonth() - 3);
        if (entryDate < boundary) return false;
      } else if (filterPeriod === 'Año actual') {
        const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
        if (entryDate < firstDayOfYear) return false;
      }

      // 5. Custom Dates bounds
      if (filterDateFrom) {
        const fromDate = new Date(filterDateFrom + 'T00:00:00');
        if (entryDate < fromDate) return false;
      }
      if (filterDateTo) {
        const toDate = new Date(filterDateTo + 'T00:00:00');
        if (entryDate > toDate) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by date descending (newest first), then by id descending
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.id.localeCompare(a.id);
    });
  }, [entries, workerById, searchTerm, filterWorkerId, filterType, filterFormaPago, filterRegime, filterCategory, filterPeriod, filterDateFrom, filterDateTo, userRole, currentUserId]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalCount = filteredEntries.length;
    const totalHours = filteredEntries.reduce((sum, e) => sum + (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)), 0);
    const totalCost = filteredEntries.reduce((sum, e) => {
      if (e.amount > 0) return sum + e.amount;
      const rate = e.rate || workerById.get(e.worker_id)?.hourlyRate || 0;
      const val = e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0);
      return sum + (val * rate);
    }, 0);

    return { totalCount, totalHours, totalCost };
  }, [filteredEntries, workerById]);

  // Pagination bounds
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage) || 1;
  const paginatedEntries = useMemo(() => {
    // Clamp page to valid limits if filters changed size
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * itemsPerPage;
    return filteredEntries.slice(start, start + itemsPerPage);
  }, [filteredEntries, currentPage, totalPages]);

  // Edit methods
  const handleOpenEdit = (entry: Entry) => {
    if (entry.locked) {
      alert('No se puede editar un registro bloqueado perteneciente a un período cerrado.');
      return;
    }
    setEditingEntry(entry);
    setEditFormData({
      worker_id: entry.worker_id || '',
      date: entry.date || '',
      type: entry.type || '',
      location: entry.location || '',
      quadro: entry.quadro || '',
      specie: entry.specie || '',
      activity: entry.activity || '',
      subtask: entry.subtask || '',
      hours: entry.hours || 0,
      quantity: entry.quantity || 0,
      amount: entry.amount || 0,
      rate: entry.rate || workerById.get(entry.worker_id)?.hourlyRate || 0
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    const isNegative = ['Adelanto', 'Descuento'].includes(editFormData.type);
    const isAdvanceType = ['Adelanto', 'Descuento', 'Licencia', 'Vacaciones', 'Bonificación', 'Parte de Enfermo'].includes(editFormData.type);
    let calculatedAmount = Number(editFormData.amount);

    if (!isAdvanceType) {
       const isHoursType = ['Trabajos al día', 'Feriado', 'Trabajos Tercerizados', 'Registro Administración'].includes(editFormData.type);
       const qty = isHoursType ? Number(editFormData.hours) : Number(editFormData.quantity);
       calculatedAmount = qty * Number(editFormData.rate);
    } else {
       if (isNegative && calculatedAmount > 0) {
         calculatedAmount = -calculatedAmount;
       }
    }

    onUpdateEntry(editingEntry.id, {
      worker_id: editFormData.worker_id,
      date: editFormData.date,
      type: editFormData.type,
      location: editFormData.location,
      quadro: editFormData.quadro,
      specie: editFormData.specie,
      activity: editFormData.activity,
      subtask: editFormData.subtask,
      hours: Number(editFormData.hours),
      quantity: Number(editFormData.quantity),
      amount: calculatedAmount,
      rate: Number(editFormData.rate),
      updated_at: new Date().toISOString()
    });

    setEditingEntry(null);
  };

  const getWorkerInfo = (workerId: string) => {
    const worker = workerById.get(workerId);
    if (!worker) return { name: 'Trabajador Desconocido', category: 'Falla de Sincronización', initials: '!', isUnknown: true };
    const parts = worker.name.split(' ');
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
    return { name: worker.name, category: worker.category, initials, isUnknown: false };
  };

  const handleDeleteClick = (entry: Entry) => {
    if (entry.locked) {
      alert('No se puede eliminar un registro bloqueado perteneciente a un período cerrado.');
      return;
    }
    if (confirm('¿Está seguro de que desea eliminar este parte de trabajo?')) {
      onDeleteEntry(entry.id);
    }
  };

  const handleExportFiltered = async () => {
    if (filteredEntries.length === 0) {
      alert("No hay registros para exportar con los filtros actuales.");
      return;
    }

    // Import dinámico: xlsx es la biblioteca más pesada del bundle y solo se
    // necesita al exportar, así no infla la carga inicial de la app.
    const XLSX = await import('xlsx');

    const exportData = filteredEntries.map(e => {
      const workerInfo = getWorkerInfo(e.worker_id);
      return {
        'Fecha': e.date,
        'Trabajador': workerInfo.name,
        'Categoría': workerInfo.category,
        'Tipo': e.type,
        'Actividad': e.activity || '',
        'Subtarea': e.subtask || '',
        'Lugar': e.location || '',
        'Cuadro': e.quadro || '',
        'Especie': e.specie || '',
        'Horas': e.hours || 0,
        'Cantidad': e.quantity || 0,
        'Precio/Tarifa': e.rate || 0,
        'Monto Total': e.amount || ((e.hours > 0 ? e.hours : e.quantity) * (e.rate || 0)),
        'Forma Pago': e.paymentMethod || '',
        'Descripción': e.notes || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
    
    ws['!cols'] = [
      {wch: 12}, {wch: 25}, {wch: 18}, {wch: 16}, {wch: 22}, 
      {wch: 20}, {wch: 15}, {wch: 10}, {wch: 15}, {wch: 8}, 
      {wch: 10}, {wch: 14}, {wch: 14}, {wch: 14}, {wch: 30}
    ];

    XLSX.writeFile(wb, `Registros_Laborales_${localDateStr()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="flex justify-between items-center bg-white border border-[#c0c9bb]/50 px-6 py-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="Buscar actividad..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-64 max-w-xs pl-9 pr-4 py-2 text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-full focus:ring-1 focus:ring-[#00450d] outline-none text-[#1a1c1c] font-medium"
            />
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#717a6d]" />
          </div>
          <button 
            onClick={handleTriggerSync} 
            disabled={isSyncing}
            className="flex py-2 px-4 rounded-full border border-[#00450d] text-[#00450d] bg-white text-xs font-bold items-center gap-1.5 hover:bg-[#f3f3f3] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> {isSyncing ? 'Sincronizando...' : 'Guardar y Sincronizar'}
          </button>
          <button 
            onClick={handleExportFiltered} 
            className="flex py-2 px-4 rounded-full border border-[#00450d] text-[#00450d] bg-[#98f994]/20 text-xs font-bold items-center gap-1.5 hover:bg-[#98f994]/40 transition-colors"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Filters Form Bento Panel */}
      <section className="bg-white border border-[#c0c9bb]/50 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-[#c0c9bb]/20 pb-3">
          <span className="font-semibold text-[#1a1c1c] text-sm flex items-center gap-2">
            <Filter className="w-4.5 h-4.5 text-[#00450d]" />
            Filtros Avanzados
          </span>
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={handleClearFilters}
              className="text-xs text-[#ba1a1a] font-bold hover:underline"
            >
              Borrar filtros
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {/* Periodo */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Período</label>
            <select
              value={filterPeriod}
              onChange={(e) => { setFilterPeriod(e.target.value); setCurrentPage(1); }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10 font-semibold"
            >
              <option value="Todos">Todos</option>
              <option value="Este mes">Este mes</option>
              <option value="Últimos 3 meses">Últimos 3 meses</option>
              <option value="Año actual">Año actual</option>
            </select>
          </div>

          {/* Fecha Desde */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Desde</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { 
                setFilterDateFrom(e.target.value); 
                if (e.target.value) setFilterPeriod('Todos');
                setCurrentPage(1); 
              }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10"
            />
          </div>

          {/* Fecha Hasta */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Hasta</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { 
                setFilterDateTo(e.target.value); 
                if (e.target.value) setFilterPeriod('Todos');
                setCurrentPage(1); 
              }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10"
            />
          </div>

          {/* Trabajador */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Trabajador</label>
            <select
              value={filterWorkerId}
              onChange={(e) => { setFilterWorkerId(e.target.value); setCurrentPage(1); }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10 font-semibold"
            >
              <option value="Todos">Todos</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Tipo Registro */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Tipo de Registro</label>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10 font-semibold"
            >
              <option value="Todos">Todos</option>
              <option value="Trabajos al día">Trabajos al día</option>
              <option value="Trabajos al tanto">Trabajos al tanto</option>
              <option value="Injertación">Injertación</option>
              <option value="Adelanto">Adelanto</option>
              <option value="Descuento">Descuento</option>
              <option value="Feriado">Feriado</option>
              <option value="Licencia">Licencia</option>
              <option value="Vacaciones">Vacaciones</option>
              <option value="Bonificación">Bonificación</option>
              <option value="Parte de Enfermo">Parte de Enfermo</option>
              <option value="Registro Administración">Registro Administración</option>
            </select>
          </div>

          {/* Régimen */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Régimen</label>
            <select
              value={filterRegime}
              onChange={(e) => { setFilterRegime(e.target.value); setCurrentPage(1); }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10 font-semibold"
            >
              <option value="Todos">Todos</option>
              <option value="temporal">Temporal</option>
              <option value="mensualizado">Mensualizado</option>
              <option value="permanente">Permanente</option>
            </select>
          </div>

          {/* Categoría */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Categoría</label>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10 font-semibold"
            >
              <option value="Todas">Todas</option>
              {Array.from(new Set(workers.map(w => w.category))).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Forma de Pago */}
          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-[11px] font-bold text-[#717a6d] uppercase tracking-wider">Forma de Pago</label>
            <select
              value={filterFormaPago}
              onChange={(e) => { setFilterFormaPago(e.target.value); setCurrentPage(1); }}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg p-2.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none h-10 font-semibold"
            >
              <option value="Todos">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
        </div>
      </section>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-4 overflow-x-auto pb-1">
        <div className="bg-[#f3f3f3] border border-[#c0c9bb]/60 px-5 py-2 rounded-full flex items-center gap-2">
          <span className="text-[#00450d] font-bold text-xs uppercase tracking-wider">Partes activos:</span>
          <span className="text-sm font-semibold text-[#1a1c1c]">{stats.totalCount} registros</span>
        </div>
        <div className="bg-[#f3f3f3] border border-[#c0c9bb]/60 px-5 py-2 rounded-full flex items-center gap-2">
          <span className="text-[#006e1c] font-bold text-xs uppercase tracking-wider">Horas acumuladas:</span>
          <span className="text-sm font-semibold text-[#1a1c1c]">{stats.totalHours.toLocaleString()} hrs</span>
        </div>
        <div className="bg-[#f3f3f3] border border-[#c0c9bb]/60 px-5 py-2 rounded-full flex items-center gap-2">
          <span className="text-[#4c3700] font-bold text-xs uppercase tracking-wider">Monto Total:</span>
          <span className="text-sm font-bold text-[#1a1c1c]">
            {formatCurrency(stats.totalCost)} ARS
          </span>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#c0c9bb]/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#00450d] text-white">
              <tr>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider">Trabajador</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider">Tipo de Labor</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider">Lugar/Sector & Actividad</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-right">Inversión/Monto</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c0c9bb]/25 bg-white text-[#1a1c1c]">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#717a6d] font-medium">
                    No se encontraron registros de trabajo que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((e) => {
                  const workerInfo = getWorkerInfo(e.worker_id);
                  const isSpecialPay = ['Adelanto', 'Descuento', 'Bonificación'].includes(e.type);
                  
                  let unitLabel = 'hrs';
                  if (['Trabajos al tanto', 'Injertación'].includes(e.type)) unitLabel = 'unid';
                  if (['Parte de Enfermo', 'Licencia', 'Vacaciones'].includes(e.type)) unitLabel = 'días';
                  
                  const displayVal = e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0);
                  const total = e.amount > 0 ? e.amount : (displayVal * (e.rate || (workerInfo.category === 'General' ? 4000 : 5000)));

                  return (
                    <tr key={e.id} className="border-b border-[#c0c9bb]/20 last:border-0 hover:bg-[#98f994]/5 transition-colors">
                      <td className="px-5 py-4 text-xs font-mono text-[#717a6d] font-medium">
                        {e.date}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                            workerInfo.isUnknown
                              ? 'bg-[#ffdad6] text-[#ba1a1a] border-[#ba1a1a]/40'
                              : 'bg-[#91d78a]/30 text-[#0c5216] border-[#c0c9bb]/20'
                          }`}>
                            {workerInfo.initials}
                          </div>
                          <div>
                            {workerInfo.isUnknown ? (
                              <>
                                <p className="text-xs font-bold text-[#ba1a1a]">Trabajador Desconocido</p>
                                <p className="text-[10px] font-bold text-[#ba1a1a] uppercase tracking-wide">Falla de Sincronización</p>
                              </>
                            ) : (
                              <>
                                <p className="text-xs font-bold text-[#1a1c1c]">{workerInfo.name}</p>
                                <p className="text-[10px] text-[#717a6d]">{workerInfo.category}</p>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          e.type === 'Descuento'
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : e.type === 'Adelanto'
                            ? 'bg-[#ffdf9e] text-[#261a00]'
                            : 'bg-[#98f994] text-[#005313]'
                        }`}>
                          {e.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <p className="font-semibold text-[#1a1c1c]">
                          {e.activity} {e.subtask ? <span className="text-[#006e1c] font-normal">/ {e.subtask}</span> : ''}
                        </p>
                        <p className="text-[10px] text-[#717a6d] mt-0.5">
                          {e.location} {e.quadro ? `• Cuadro ${e.quadro}` : ''} {e.specie ? `• [${e.specie}]` : ''}
                        </p>
                        {e.paymentMethod && (
                          <p className="text-[10px] text-[#ba1a1a] mt-0.5 font-bold uppercase">
                            Pago: {e.paymentMethod}
                          </p>
                        )}
                        {e.notes && (
                          <p className="text-[10px] text-[#717a6d] mt-0.5 italic">
                            Nota: {e.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-xs">
                        <span className="font-bold text-[#1a1c1c]">
                          {isSpecialPay ? formatCurrency(e.amount) : `${displayVal.toFixed(1)} ${unitLabel}`}
                        </span>
                        {!isSpecialPay && (
                          <span className="block text-[10px] text-[#0c7521] mt-0.5">
                            Valor: {formatCurrency(total)}
                          </span>
                        )}
                        {isSpecialPay && e.type === 'Descuento' && (
                          <span className="block text-[10px] text-[#ba1a1a] mt-0.5">Deducción de nómina</span>
                        )}
                        {e.locked && (
                          <span className="flex items-center justify-end gap-1 text-[10px] text-[#717a6d] mt-1 font-bold">
                            <Lock className="w-3 h-3" /> Cerrado
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!e.locked && userRole !== 'visor' && (userRole === 'direccion' || userRole === 'admin' || e.created_by === currentUserId) && (
                            <button
                              onClick={() => handleOpenEdit(e)}
                              className="p-1 px-2.5 text-[#006e1c] hover:bg-[#98f994]/40 rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!e.locked && userRole !== 'visor' && (userRole === 'direccion' || e.created_by === currentUserId) && (
                            <button
                              onClick={() => handleDeleteClick(e)}
                              className="p-1 px-2.5 text-[#ba1a1a] hover:bg-[#ffdad6]/50 rounded-lg transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(!e.locked && userRole !== 'direccion' && userRole !== 'admin' && userRole !== 'encargado' && userRole !== 'visor') && (
                            <span className="text-[10px] text-[#717a6d] font-semibold italic bg-[#f3f3f3] px-1.5 py-0.5 rounded">
                              Lectura/Edición
                            </span>
                          )}
                          {(!e.locked && userRole === 'visor') && (
                            <span className="text-[10px] text-[#717a6d] font-semibold italic bg-[#f3f3f3] px-1.5 py-0.5 rounded">
                              Solo Lectura
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Client side Pagination controls */}
        <div className="px-6 py-4 bg-[#f3f3f3]/50 border-t border-[#c0c9bb]/30 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-xs text-[#717a6d]">
            Mostrando <span className="font-semibold text-[#1a1c1c]">{paginatedEntries.length}</span> de <span className="font-semibold text-[#1a1c1c]">{filteredEntries.length}</span> registros.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-[#c0c9bb]/50 bg-white hover:bg-[#f3f3f3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[#1a1c1c]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-[#1a1c1c] px-2 text-center min-w-10">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-[#c0c9bb]/50 bg-white hover:bg-[#f3f3f3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[#1a1c1c]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Asymmetric Informational Bento Grid Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 relative h-48 rounded-2xl overflow-hidden shadow-sm group border border-[#c0c9bb]/20">
          <img 
            className="absolute inset-0 w-full h-full object-cover filter brightness-[0.7] group-hover:scale-105 transition-transform duration-700" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCehCm2f0PFQi3R7ZXBdF-O8z178lR-W_3CJ1hi6LJ9yfw2DLqcDpO_kXVSzEyZiX8DvrMI-yckOMKM10R-3gmXnP5NHqLB_b8z1vPouvFEuEvRSA4TAdqqIm3G61VJjJib8oy18u3gG4NbB-4TNN2AmwW5dQl9rqL5vQ8XR8mj78P0EBe5Qul9h4mMvIipbr6qTSMBputxluSu_SpFc71hE2KKxkii6xqFI8rTTf1mjAJvtkTJ12FYIBO4RwLSajA0rz3s3iJefCfR" 
            alt="Vivero Profesional"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#00450d]/90 to-transparent flex flex-col justify-center p-6 text-white">
            <h3 className="font-bold text-lg text-[#acf4a4] mb-1">Análisis de Productividad</h3>
            <p className="text-xs text-white/95 max-w-sm">
              Cada parte de trabajo sirve para cuantificar los costes reales por cuadro cultivado, especie, y sector operativo. Optimice la mano de obra agrícola.
            </p>
          </div>
        </div>
        <div className="bg-[#98f994]/20 border border-[#acf4a4] p-6 rounded-2xl flex flex-col justify-between text-[#005313]">
          <div>
            <CheckCircle className="w-9 h-9 text-[#006e1c] mb-3" />
            <h4 className="font-bold text-sm uppercase tracking-wider mb-1">Calidad Bobadilla</h4>
          </div>
          <p className="text-xs font-semibold text-[#0c7521]">
            Todos los registros son validados automáticamente de acuerdo con el régimen asignado al trabajador.
          </p>
        </div>
      </div>

      {/* Inline Edit Entry Sheet / Modal Backdrop */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-white border border-[#c0c9bb] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setEditingEntry(null)} 
              className="absolute top-4 right-4 p-1.5 hover:bg-[#f3f3f3] rounded-full transition-colors text-[#717a6d]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-[#00450d] mb-4 flex items-center gap-1.5">
              <FileEdit className="w-5 h-5" /> Editar Registro de Trabajo
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Fecha</label>
                  <input
                    type="date"
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9]"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Trabajador</label>
                  <select
                    value={editFormData.worker_id}
                    onChange={(e) => setEditFormData({ ...editFormData, worker_id: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9] font-semibold"
                  >
                    <option value="">Seleccionar...</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Tipo Registro</label>
                  <select
                    value={editFormData.type}
                    onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9] font-semibold"
                  >
                    <option value="Trabajos al día">Trabajos al día</option>
                    <option value="Trabajos al tanto">Trabajos al tanto</option>
                    <option value="Injertación">Injertación</option>
                    <option value="Trabajos Tercerizados">Trabajos Tercerizados</option>
                    {userRole !== 'encargado' && (
                      <>
                        <option value="Adelanto">Adelanto</option>
                        <option value="Descuento">Descuento</option>
                        <option value="Feriado">Feriado</option>
                        <option value="Licencia">Licencia</option>
                        <option value="Vacaciones">Vacaciones</option>
                        <option value="Bonificación">Bonificación</option>
                        <option value="Parte de Enfermo">Parte de Enfermo</option>
                        <option value="Registro Administración">Registro Administración</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Lugar/Sector</label>
                  <select
                    value={editFormData.location}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9]"
                  >
                    {catalogs.locations.map((loc, i) => (
                      <option key={i} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Cuadro</label>
                  <input
                    type="text"
                    value={editFormData.quadro}
                    onChange={(e) => setEditFormData({ ...editFormData, quadro: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9]"
                    placeholder="Ej: C-24"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Especie</label>
                  <select
                    value={editFormData.specie}
                    onChange={(e) => setEditFormData({ ...editFormData, specie: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9]"
                  >
                    <option value="">--</option>
                    {catalogs.species.map((sp, i) => (
                      <option key={i} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Actividad</label>
                  <select
                    value={editFormData.activity}
                    onChange={(e) => setEditFormData({ ...editFormData, activity: e.target.value, subtask: '' })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9] font-semibold"
                  >
                    <option value="">--</option>
                    {Object.keys(catalogs.activities).map((act, i) => (
                      <option key={i} value={act}>{act}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Sub-tarea</label>
                  <select
                    value={editFormData.subtask}
                    onChange={(e) => setEditFormData({ ...editFormData, subtask: e.target.value })}
                    className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9]"
                  >
                    <option value="">--</option>
                    {editFormData.activity && catalogs.activities[editFormData.activity as keyof typeof catalogs.activities]?.map((t: string, i: number) => (
                      <option key={i} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-[#f3f3f3]/50 p-3 rounded-xl border border-[#c0c9bb]/30">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase text-center">Horas</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editFormData.hours}
                    onChange={(e) => setEditFormData({ ...editFormData, hours: Number(e.target.value) })}
                    className="text-xs border border-[#c0c9bb]/60 rounded-lg p-2 text-center bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase text-center">Cant.</label>
                  <input
                    type="number"
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData({ ...editFormData, quantity: Number(e.target.value) })}
                    className="text-xs border border-[#c0c9bb]/60 rounded-lg p-2 text-center bg-white"
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase text-center">Precio/Hora</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editFormData.rate}
                    onChange={(e) => setEditFormData({ ...editFormData, rate: Number(e.target.value) })}
                    className="text-xs border border-[#c0c9bb]/60 rounded-lg p-2 text-center bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#717a6d] uppercase">Monto Fijo / Adelanto ($)</label>
                <input
                  type="number"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: Number(e.target.value) })}
                  className="text-xs border border-[#c0c9bb]/70 rounded-lg p-2.5 bg-[#f9f9f9]"
                  placeholder="Si aplica para egreso directo o ajuste"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#00450d] text-white hover:bg-[#002203] font-bold text-xs rounded-xl shadow-md transition-all uppercase"
                >
                  Guardar Cambios
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="py-2.5 px-5 border-2 border-[#c0c9bb] hover:bg-[#f3f3f3] text-[#717a6d] font-bold text-xs rounded-xl transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
