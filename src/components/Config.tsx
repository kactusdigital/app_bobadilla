import React, { useState, useEffect } from 'react';
import { Worker, MasterCatalogs, formatCurrency } from '../types';
import { performBidirectionalSync, getCurrentSupabaseUser, registerSupabaseUser, fetchAuditLogs, AuditLogItem } from '../supabaseClient';
import { Database, Plus, Edit2, Trash2, ShieldCheck, Eye, EyeOff, CheckCircle2, AlertTriangle, Play, RefreshCw, MapPin, Leaf, BookOpen, Clock, Loader2, Coins, History, FileText, Terminal, Download, Upload, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ConfigProps {
  workers: Worker[];
  catalogs: MasterCatalogs;
  onUpdateWorkers: (updated: Worker[]) => void;
  onUpdateCatalogs: (updated: MasterCatalogs) => void;
  userRole?: string;
}

export default function Config({ workers, catalogs, onUpdateWorkers, onUpdateCatalogs, userRole }: ConfigProps) {


  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Auth Form State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRole, setAuthRole] = useState<'admin' | 'operador'>('admin');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Workers CRUD states
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [workerFormData, setWorkerFormData] = useState({
    name: '',
    category: '',
    regime: 'temporal' as 'temporal' | 'permanente' | 'mensualizado' | 'administracion',
    hourlyRate: 4000,
    fixedSalary: 0,
    isActive: true,
    legajo: '',
    dni: '',
    cuit: '',
    bankAccount: ''
  });

  // Catalogs states
  const [showAddCatalogItem, setShowAddCatalogItem] = useState<{ type: 'location' | 'specie' | 'activity' | null }>({ type: null });
  const [newCatalogItemText, setNewCatalogItemText] = useState('');
  const [newCategoryRate, setNewCategoryRate] = useState(4000);

  // Rates editing state
  const [editingRateIdx, setEditingRateIdx] = useState<number | null>(null);
  const [editRateValue, setEditRateValue] = useState<number>(0);

  const handleSaveRate = (index: number) => {
    const updatedCategories = [...catalogs.categories];
    updatedCategories[index] = { ...updatedCategories[index], defaultRate: editRateValue };
    const updated = { ...catalogs, categories: updatedCategories };
    onUpdateCatalogs(updated);
    setEditingRateIdx(null);
    localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
  };

  const refreshUserSession = async () => {
    const user = await getCurrentSupabaseUser();
    setCurrentUser(user);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthMessage({ text: 'Por favor, ingrese email y contraseña.', isError: true });
      return;
    }
    setIsAuthLoading(true);
    setAuthMessage(null);
    const result = await registerSupabaseUser(authEmail, authPassword, authRole);
    setIsAuthLoading(false);
    if (result.success) {
      setAuthMessage({ text: result.message, isError: false });
      setAuthEmail('');
      setAuthPassword('');
    } else {
      setAuthMessage({ text: result.message, isError: true });
    }
  };

  const handleLoadAuditLogs = async () => {
    setIsAuditLoading(true);
    setAuditError(null);
    const result = await fetchAuditLogs();
    setIsAuditLoading(false);
    if (result.success && result.data) {
      setAuditLogs(result.data);
    } else {
      setAuditError(result.message || 'Error al descargar bitácora.');
    }
  };

  useEffect(() => {
    refreshUserSession();
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role === 'admin') {
      handleLoadAuditLogs();
    } else {
      setAuditLogs([]);
    }
  }, [currentUser]);

  // Sync diagnostic helper
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Sincronizando...');
    const result = await performBidirectionalSync();
    setIsSyncing(false);
    
    if (result.success) {
      setSyncStatus(`¡Éxito! Subidos: ${result.uploaded}, Descargados: ${result.downloaded}, Borrados: ${result.deleted}. Configuración al día.`);
    } else {
      setSyncStatus(`Error: ${result.message}`);
      if (result.message.includes('Versión antigua detectada')) {
        alert(result.message);
      }
    }
  };

  // Backup / Restore handlers
  const handleExportBackup = () => {
    const entries = localStorage.getItem('bobadilla_entries');
    const workers = localStorage.getItem('bobadilla_workers');
    const catalogs = localStorage.getItem('bobadilla_catalogs');
    
    const backupData = {
      timestamp: new Date().toISOString(),
      entries: entries ? JSON.parse(entries) : [],
      workers: workers ? JSON.parse(workers) : [],
      catalogs: catalogs ? JSON.parse(catalogs) : {}
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_Bobadilla_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('ATENCIÓN: Restaurar una copia de seguridad sobrescribirá TODOS los datos actuales locales con los del archivo. ¿Está absolutamente seguro de continuar?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.entries && data.workers && data.catalogs) {
          localStorage.setItem('bobadilla_entries', JSON.stringify(data.entries));
          localStorage.setItem('bobadilla_workers', JSON.stringify(data.workers));
          localStorage.setItem('bobadilla_catalogs', JSON.stringify(data.catalogs));
          localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
          alert('Copia de seguridad restaurada correctamente. La aplicación se recargará.');
          window.location.reload();
        } else {
          alert('El archivo no tiene el formato de copia de seguridad válido.');
        }
      } catch (err) {
        alert('Error al leer el archivo. Asegúrese de que es un JSON válido de backup.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };





  // Workers CRUD operations
  const handleOpenAddWorker = () => {
    setEditingWorkerId(null);
    setWorkerFormData({
      name: '',
      category: catalogs.categories[0]?.name || 'Peon General',
      regime: 'temporal',
      hourlyRate: catalogs.categories[0]?.defaultRate || 4000,
      fixedSalary: 180000,
      isActive: true,
      legajo: '#' + Math.floor(1000 + Math.random() * 9000),
      dni: '',
      cuit: '',
      bankAccount: ''
    });
    setShowWorkerModal(true);
  };

  const handleOpenEditWorker = (w: Worker) => {
    setEditingWorkerId(w.id);
    setWorkerFormData({
      name: w.name,
      category: w.category,
      regime: w.regime,
      hourlyRate: w.hourlyRate,
      fixedSalary: w.fixedSalary || 55000,
      isActive: w.isActive,
      legajo: w.legajo,
      dni: w.dni || '',
      cuit: w.cuit || '',
      bankAccount: w.bankAccount || ''
    });
    setShowWorkerModal(true);
  };

  const handleSaveWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerFormData.name) return;

    if (editingWorkerId) {
      // update
      const updated = workers.map(w => {
        if (w.id === editingWorkerId) {
          return {
            ...w,
            name: workerFormData.name,
            category: workerFormData.category,
            regime: workerFormData.regime,
            hourlyRate: Number(workerFormData.hourlyRate),
            fixedSalary: Number(workerFormData.fixedSalary),
            isActive: workerFormData.isActive,
            legajo: workerFormData.legajo,
            dni: workerFormData.dni,
            cuit: workerFormData.cuit,
            bankAccount: workerFormData.bankAccount
          };
        }
        return w;
      });
      onUpdateWorkers(updated);
    } else {
      // create
      const newWorker: Worker = {
        id: 'w_' + Math.random().toString(36).substring(2, 9),
        name: workerFormData.name,
        category: workerFormData.category,
        regime: workerFormData.regime,
        hourlyRate: Number(workerFormData.hourlyRate),
        fixedSalary: Number(workerFormData.fixedSalary),
        isActive: workerFormData.isActive,
        legajo: workerFormData.legajo,
        dni: workerFormData.dni,
        cuit: workerFormData.cuit,
        bankAccount: workerFormData.bankAccount
      };
      onUpdateWorkers([...workers, newWorker]);
    }

    // Bump local config timestamp for database synchronization tracking
    localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
    setShowWorkerModal(false);
  };

  const handleExportWorkersExcel = () => {
    const data = workers.map(w => ({
      'Legajo': w.legajo,
      'Nombre': w.name,
      'DNI': w.dni || '',
      'CUIT': w.cuit || '',
      'Cuenta Bancaria': w.bankAccount || '',
      'Categoría': w.category,
      'Régimen': w.regime,
      'Precio Hora': w.hourlyRate,
      'Sueldo Fijo': w.fixedSalary || 0,
      'Estado': w.isActive ? 'Activo' : 'Baja Temp'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Personal");
    XLSX.writeFile(wb, `Personal_Bobadilla_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDeleteWorker = (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar a este trabajador del sistema?')) {
      const updated = workers.filter(w => w.id !== id);
      onUpdateWorkers(updated);
      localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
    }
  };

  // Add items directly to catalogs
  const handleAddCatalogItemSubmit = () => {
    if (!newCatalogItemText) return;
    const type = showAddCatalogItem.type;
    
    if (type === 'location') {
      const updated = { ...catalogs, locations: [...catalogs.locations, newCatalogItemText] };
      onUpdateCatalogs(updated);
    } else if (type === 'specie') {
      const updated = { ...catalogs, species: [...catalogs.species, newCatalogItemText] };
      onUpdateCatalogs(updated);
    } else if (type === 'activity') {
      const updated = { ...catalogs, activities: [...catalogs.activities, newCatalogItemText] };
      onUpdateCatalogs(updated);
    } else if (type === 'category') {
      const updated = { ...catalogs, categories: [...catalogs.categories, { name: newCatalogItemText, description: 'Nómina agropecuaria', defaultRate: newCategoryRate }] };
      onUpdateCatalogs(updated);
    }

    localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
    setNewCatalogItemText('');
    setNewCategoryRate(4000);
    setShowAddCatalogItem({ type: null });
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header */}
      <div className="header-container">
        <h2 className="text-xl font-bold text-[#00450d] mb-1">Ajustes & Configuración</h2>
        <p className="text-xs text-[#717a6d]">Gestione las base de datos en la nube (Supabase), personal agrícola y catálogos maestros.</p>
      </div>

      {/* Grid: cloud database settings & sync diagnostic banner */}
      {/* Grid: Access Management & Sync */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="cloud-database-config">
        {/* Left instructions block */}
        <div className="space-y-2">
          <h3 className="font-bold text-sm text-[#1a1c1c] flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-[#00450d]" /> Gestión de Accesos
          </h3>
          <p className="text-xs text-[#717a6d] leading-relaxed">
            Administre las cuentas de operadores. Solo el superadministrador puede registrar nuevos usuarios.
            La conexión a la base de datos ya está preconfigurada de forma segura.
          </p>

          <div className="pt-4 border-t border-[#c0c9bb]/40 mt-4">
             <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="px-4 py-2 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-[#006e1c] rounded-xl text-xs font-bold flex items-center gap-1.5 border border-[#c0c9bb]/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Guardar y Sincronizar
            </button>
            {syncStatus && (
              <p className="text-[10px] text-[#00450d] font-semibold mt-2">{syncStatus}</p>
            )}
          </div>
        </div>

        {/* Right input forms */}
        <div className="lg:col-span-2 bg-white border border-[#c0c9bb]/50 rounded-2xl p-6 shadow-sm space-y-4">
          {currentUser?.role === 'direccion' ? (
             <div className="space-y-4">
                <div className="flex items-start justify-between border-b border-[#c0c9bb]/25 pb-2.5">
                  <div>
                    <p className="text-xs font-bold text-[#1a1c1c]">
                      Registrar operador de base de datos
                    </p>
                    <p className="text-[10px] text-[#717a6d] mt-0.5 font-semibold">
                      Cree una cuenta para asociarle un rol de firma electrónica y auditoría.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#717a6d] uppercase">Correo Electrónico</label>
                      <input
                        type="email"
                        placeholder="vivero@correo.com"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        required
                        className="h-10 border border-[#c0c9bb] rounded-lg px-3 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#717a6d] uppercase">Contraseña</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        required
                        className="h-10 border border-[#c0c9bb] rounded-lg px-3 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 max-w-xs pt-1">
                    <label className="text-[10px] font-bold text-[#717a6d] uppercase">Rol asignado</label>
                    <select
                      value={authRole}
                      onChange={(e) => setAuthRole(e.target.value as any)}
                      className="h-10 border border-[#c0c9bb] rounded-lg px-3 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-white"
                    >
                      <option value="admin">Administrador (Puede eliminar)</option>
                      <option value="encargado">Encargado (Carga/Edita, no borra)</option>
                      <option value="visor">Visor (Solo lectura)</option>
                    </select>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isAuthLoading}
                      className="px-5 py-2 bg-[#00450d] hover:bg-[#002203] text-white text-xs font-bold rounded-lg transition-all shadow active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isAuthLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" /> Registrar Cuenta
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {authMessage && (
                  <div className={`p-2.5 rounded-lg border text-xs font-semibold ${
                    authMessage.isError 
                      ? 'bg-[#ffdad6]/45 border-[#ffdaae] text-[#ba1a1a]' 
                      : 'bg-[#98f994]/20 border-[#acf4a4] text-[#005313]'
                  }`}>
                    {authMessage.text}
                  </div>
                )}
             </div>
          ) : (
            <div className="bg-[#ffdad6]/25 border border-[#ffdaae] rounded-2xl p-5 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-[#ba1a1a] mx-auto" />
              <h3 className="text-xs font-bold text-[#ba1a1a] uppercase tracking-wider">Acceso Restringido</h3>
              <p className="text-[11px] text-[#717a6d] leading-relaxed">
                Solo el usuario con rol de Dirección puede registrar nuevos operadores en el sistema.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Sección de Historial de Auditoría con Triggers PostgreSQL */}
      <section className="bg-white border border-[#c0c9bb]/50 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#c0c9bb]/20 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#00450d]/5 flex items-center justify-center text-[#00450d]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#1a1c1c] uppercase tracking-wider">Bitácora de Auditoría de Base de Datos</h3>
              <p className="text-[11px] text-[#717a6d]">Operaciones registradas automáticamente por triggers PostgreSQL en Supabase.</p>
            </div>
          </div>
          {currentUser?.role === 'direccion' && (
            <button
              onClick={handleLoadAuditLogs}
              disabled={isAuditLoading}
              className="px-3.5 py-1.5 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-[#006e1c] border border-[#c0c9bb]/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? 'animate-spin' : ''}`} />
              Actualizar Bitácora
            </button>
          )}
        </div>

        {currentUser?.role === 'direccion' ? (
          <div>
            {isAuditLoading && auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[#717a6d] gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#00450d]" />
                <p className="text-xs font-semibold">Cargando registros de auditoría desde el servidor...</p>
              </div>
            ) : auditError ? (
              <div className="p-4 bg-[#ffdad6]/20 border border-[#ffdad6] rounded-xl text-[#ba1a1a] text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5" />
                <p>{auditError}</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-[#717a6d] space-y-1 bg-[#f9f9f9] rounded-xl border border-[#c0c9bb]/20">
                <FileText className="w-8 h-8 mx-auto text-[#c0c9bb] mb-1" />
                <p className="text-xs font-bold">No se encontraron registros en <code className="bg-[#e2e2e2] px-1 py-0.5 rounded font-mono">audit_log</code></p>
                <p className="text-[10px] text-[#717a6d] px-4 max-w-sm mx-auto leading-relaxed">
                  Las transacciones hechas en la tabla <code className="bg-[#e2e2e2] px-1 py-0.5 rounded font-mono">entries_v4</code> por los triggers aparecerán aquí al sincronizar.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[10px] text-[#717a6d] font-semibold">
                  Mostrando los últimos {auditLogs.length} eventos capturados por el trigger <code className="bg-[#fafafa] border border-gray-200 px-1 rounded font-mono font-bold text-[#00450d]">entries_audit</code> en la base de datos:
                </p>
                <div className="overflow-x-auto border border-[#c0c9bb]/30 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f9f9f9] text-[#717a6d] border-b border-[#c0c9bb]/35 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-2.5">Fecha / Hora</th>
                        <th className="px-4 py-2.5">Operación</th>
                        <th className="px-4 py-2.5">Tabla</th>
                        <th className="px-4 py-2.5">ID Registro</th>
                        <th className="px-4 py-2.5">Operador (UID)</th>
                        <th className="px-4 py-2.5">Detalle / Cambios</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c0c9bb]/20 text-[#1a1c1c] font-semibold">
                      {auditLogs.map((log) => {
                        const dateStr = new Date(log.created_at).toLocaleString();
                        const actionColors: { [key: string]: string } = {
                          INSERT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          UPDATE: 'bg-sky-50 text-sky-700 border-sky-200',
                          DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
                          UPSERT: 'bg-amber-50 text-amber-700 border-amber-200'
                        };
                        const badgeStyle = actionColors[log.action] || 'bg-gray-50 text-gray-700 border-gray-200';
                        
                        // Parse details of change
                        let changeSummary = '---';
                        try {
                          if (log.action === 'UPDATE' && log.old_data && log.new_data) {
                            const oldD = log.old_data;
                            const newD = log.new_data;
                            const changedFields: string[] = [];
                            for (const key in newD) {
                              if (JSON.stringify(oldD[key]) !== JSON.stringify(newD[key])) {
                                changedFields.push(key);
                              }
                            }
                            changeSummary = changedFields.length > 0 
                              ? `Modificó: ${changedFields.join(', ')}` 
                              : 'Valores sin cambios';
                          } else if (log.action === 'INSERT' && log.new_data) {
                            changeSummary = `Creado: ${log.new_data.worker_name || log.new_data.worker || 'Registro'}`;
                          } else if (log.action === 'DELETE' && log.old_data) {
                            changeSummary = `Eliminado: ${log.old_data.worker_name || log.old_data.worker || 'Registro'}`;
                          }
                        } catch (e) {
                          changeSummary = 'Error al parsear payload';
                        }

                        return (
                          <tr key={log.id} className="hover:bg-[#f3f3f3]/15 transition-colors">
                            <td className="px-4 py-3 text-[11px] text-[#717a6d] whitespace-nowrap font-mono">{dateStr}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${badgeStyle}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[#717a6d]">{log.table_name}</td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[#006e1c] font-bold">#{log.record_id}</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-[#717a6d]" title={log.user_id || 'Trigger PG de Sistema'}>
                              {log.user_id ? log.user_id.substring(0, 8) + '...' : 'Trigger (Definer)'}
                            </td>
                            <td className="px-4 py-3 text-[11px] text-[#4a4d4a]">{changeSummary}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#fcf8f2] border border-[#f0e4d0] rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-[#856404] font-semibold">
            <div className="flex gap-2.5 items-start">
              <ShieldCheck className="w-5 h-5 text-[#856404] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#856404]">Vista de Auditoría Restringida por RLS</p>
                <p className="text-[10px] text-[#717a6d] mt-0.5 font-normal leading-relaxed">
                  Inicie sesión con un usuario de rol **Dirección** (<code className="bg-amber-100 px-1 py-0.5 rounded font-mono">direccion</code>) en el panel superior para descargar el historial de auditoría sincronizado. Las políticas de Row Level Security (RLS) protegen esta información de visualizadores no autorizados.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Database trigger SQL recipe info card */}
        <div className="bg-[#f9f9f9] border border-[#c0c9bb]/25 rounded-xl p-4">
          <button 
            type="button" 
            onClick={() => {
              const el = document.getElementById('trigger-sql-box');
              if (el) el.classList.toggle('hidden');
            }}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#00450d]" />
              <span className="text-xs font-bold text-[#1a1c1c]">Ver Estructura de Trigger y Función SQL de Auditoría</span>
            </div>
            <span className="text-[10px] text-[#006e1c] font-bold hover:underline">Alternar SQL de Servidor</span>
          </button>
          
          <div id="trigger-sql-box" className="hidden mt-3 text-[11px] font-mono leading-relaxed bg-[#1d221c] text-[#cbf4c6] p-3 rounded-lg overflow-x-auto shadow-inner border border-[#acf4a4]/10 max-h-60">
            <p className="text-[10px] text-[#717a6d] mb-2 font-sans font-semibold">-- IMPORTANTE: Ejecute este SQL en la consola SQL de Supabase para reparar la lentitud de la bitácora y optimizar el servidor:</p>
            {`-- 1. Crear índice para evitar TIMEOUTS al consultar la bitácora
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- 2. Función de Auditoría
CREATE OR REPLACE FUNCTION audit_entry_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Evitar registrar actualizaciones si los datos no cambiaron realmente
  IF TG_OP = 'UPDATE' THEN
    IF OLD IS NOT DISTINCT FROM NEW THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO audit_log (user_id, action, table_name,
    record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
         WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb
         ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)::jsonb
         WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW)::jsonb
         ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger optimizado
DROP TRIGGER IF EXISTS entries_audit ON entries_v4;
CREATE TRIGGER entries_audit
  AFTER INSERT OR DELETE OR UPDATE ON entries_v4
  FOR EACH ROW
  EXECUTE FUNCTION audit_entry_changes();`}
          </div>

          {/* Fix Cache Button */}
          <div className="bg-[#fff0f0] border border-[#ffcaca] rounded-xl p-4 mt-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[#d32f2f]">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="text-sm font-bold">Solucionador de Problemas (Limpiar Caché)</h3>
              </div>
              <p className="text-xs text-[#5c3a3a] mb-2">
                Si la aplicación muestra datos desactualizados, se queda congelada, o muestra errores inesperados tras una actualización, usa este botón. 
                Forzará la eliminación de la memoria interna del navegador y descargará la última versión disponible desde cero.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Estás seguro? Esto borrará la caché local y recargará la aplicación. Si tienes Partes de Trabajo sin sincronizar, se perderán. Asegúrate de haber sincronizado primero.")) {
                    const pin = localStorage.getItem('bobadilla_pin');
                    localStorage.clear();
                    if (pin) localStorage.setItem('bobadilla_pin', pin);
                    
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(function(registrations) {
                        for (let registration of registrations) {
                          registration.unregister();
                        }
                      });
                    }
                    window.location.reload();
                  }
                }}
                className="flex items-center justify-center gap-2 bg-[#d32f2f] hover:bg-[#b71c1c] text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors w-full sm:w-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Forzar Actualización y Limpiar Caché
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Respaldo y Recuperación Local */}
      <section className="bg-white border border-[#c0c9bb]/50 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-[#c0c9bb]/20 pb-3">
          <Database className="w-5 h-5 text-[#00450d]" />
          <div>
            <h3 className="font-bold text-sm text-[#1a1c1c] uppercase tracking-wider">Respaldo y Restauración Manual</h3>
            <p className="text-[11px] text-[#717a6d]">Descarga o restaura una copia completa de toda la información (trabajadores, catálogos, registros).</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleExportBackup}
            className="flex-1 py-3 bg-[#e8f5e9] hover:bg-[#c8e6c9] border border-[#a5d6a7] text-[#1b5e20] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Download className="w-4.5 h-4.5" />
            Descargar Backup (JSON)
          </button>
          
          <div className="flex-1 relative">
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Cargar archivo de backup"
            />
            <button className="w-full py-3 bg-[#fff3e0] hover:bg-[#ffe0b2] border border-[#ffcc80] text-[#e65100] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm pointer-events-none">
              <Upload className="w-4.5 h-4.5" />
              Restaurar Backup (JSON)
            </button>
          </div>
        </div>
        <div className="bg-[#fcf8f2] border border-[#f0e4d0] rounded-xl p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#856404] shrink-0" />
          <p className="text-[10px] text-[#856404] leading-relaxed font-semibold">
            El archivo JSON contiene toda la información de la base de datos hasta el instante actual. Al restaurarlo, se sobrescribirán tus datos locales actuales. Se recomienda realizar una descarga de seguridad frecuentemente y almacenarla en la nube (Drive/OneDrive) o en un pendrive de manera precautoria.
          </p>
        </div>
      </section>

      {/* Workers list management CRUD & rates panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pt-4">
        {/* Workers CRUD list */}
        <section className="xl:col-span-8 bg-white border border-[#c0c9bb]/50 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between" id="section-workers-crud">
          <div>
            <div className="px-6 py-4 bg-[#f3f3f3]/60 border-b border-[#c0c9bb]/25 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-base text-[#1a1c1c]">Gestión de Personal</h4>
                <p className="text-[11px] text-[#717a6d]">Alta, baja y modificación de trabajadores de campo.</p>
              </div>
               {(userRole === 'admin' || userRole === 'direccion') && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportWorkersExcel}
                    className="bg-[#f3f3f3] hover:bg-[#e8e8e8] text-[#00450d] border border-[#00450d]/20 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" /> Exportar a Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAddWorker}
                    className="bg-[#00450d] hover:bg-[#002203] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Añadir Trabajador
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#f9f9f9] border-b border-[#c0c9bb]/50 text-[#717a6d]">
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider">Nombre</th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider">Categoría</th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c0c9bb]/25 text-[#1a1c1c]">
                  {workers.map((w) => {
                    const initials = w.name.substring(0, 2).toUpperCase();
                    return (
                      <tr key={w.id} className="hover:bg-[#f3f3f3]/25 transition-colors">
                        <td className="px-6 py-3.5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#f3f3f3] flex items-center justify-center font-bold text-xs text-[#00450d] border border-[#c0c9bb]/30">
                            {initials}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#1a1c1c]">{w.name}</p>
                            <span className="text-[9px] font-semibold text-[#717a6d] font-mono">{w.legajo}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-xs text-[#717a6d]">
                          <div>
                            <p className="font-semibold text-[#1a1c1c]">{w.category}</p>
                            <p className="text-[10px] text-[#0c7521] leading-none uppercase mt-0.5 mb-1">{w.regime}</p>
                            {w.regime === 'mensualizado' && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <span className="text-[10px] font-bold text-[#717a6d]">$</span>
                                <input 
                                  type="number"
                                  placeholder="Sueldo Fijo"
                                  value={w.fixedSalary || ''}
                                  onChange={(e) => {
                                    const updated = workers.map(wx => wx.id === w.id ? { ...wx, fixedSalary: Number(e.target.value) } : wx);
                                    onUpdateWorkers(updated);
                                    localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
                                  }}
                                  className="h-6 w-20 px-1 border border-[#c0c9bb] rounded bg-white text-[#1a1c1c] font-bold text-xs outline-none focus:border-[#00450d]"
                                  title="Editar Sueldo Mensual"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            w.isActive 
                              ? 'bg-[#98f994]/30 text-[#005313]' 
                              : 'bg-[#ffdad6] text-[#ba1a1a]'
                          }`}>
                            {w.isActive ? 'Activo' : 'Baja Temp'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(userRole === 'admin' || userRole === 'direccion') && (
                              <button
                                onClick={() => handleOpenEditWorker(w)}
                                className="p-1 text-[#006e1c] hover:bg-[#98f994]/40 rounded-lg transition-all"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(userRole === 'admin' || userRole === 'direccion') && (
                              <button
                                onClick={() => handleDeleteWorker(w.id)}
                                className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6]/50 rounded-lg transition-all"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Hourly Rates static view list panel */}
        <section className="xl:col-span-4 space-y-4" id="section-hourly-rates">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-[#1a1c1c] uppercase tracking-wider">Tarifas Referenciales</h3>
              <span className="text-[10px] text-[#717a6d]">Convenio Viveristas</span>
            </div>
            {userRole === 'direccion' && (
              <button
                onClick={() => setShowAddCatalogItem({ type: 'category' })}
                className="bg-[#00450d] hover:bg-[#002203] text-white text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-sm transition-all"
              >
                + Añadir Rol
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {catalogs.categories.map((cat, i) => (
              <div key={i} className="bg-[#f9f9f9] border border-[#c0c9bb]/60 p-4 rounded-xl flex justify-between items-center shadow-inner-custom group">
                <div>
                  <p className="text-xs font-bold text-[#1a1c1c]">{cat.name}</p>
                  <p className="text-[10px] text-[#717a6d] mt-0.5 leading-none">{cat.description || 'Nómina agropecuaria'}</p>
                </div>
                <div className="flex items-center gap-3">
                  {editingRateIdx === i ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        value={editRateValue}
                        onChange={(e) => setEditRateValue(Number(e.target.value))}
                        className="w-20 h-7 border border-[#00450d] rounded px-2 text-right text-xs font-bold text-[#00450d] focus:ring-0 focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRate(i);
                          if (e.key === 'Escape') setEditingRateIdx(null);
                        }}
                      />
                      <button 
                        onClick={() => handleSaveRate(i)}
                        className="bg-[#00450d] text-white p-1 rounded hover:bg-[#002203] transition-colors"
                        title="Guardar"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#00450d]">{formatCurrency(cat.defaultRate)}</p>
                        <p className="text-[9px] font-bold text-[#717a6d]">ARS / hr</p>
                      </div>
                      {userRole === 'direccion' && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                          <button
                            onClick={() => {
                              setEditingRateIdx(i);
                              setEditRateValue(cat.defaultRate);
                            }}
                            className="p-1.5 text-[#006e1c] hover:bg-[#98f994]/40 rounded-lg"
                            title="Editar tarifa"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if(confirm(`¿Eliminar categoría: ${cat.name}?`)) {
                                const updated = { ...catalogs, categories: catalogs.categories.filter((_, idx) => idx !== i) };
                                onUpdateCatalogs(updated);
                                localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
                              }
                            }}
                            className="p-1.5 text-[#ba1a1a] hover:bg-[#ffdad6]/50 rounded-lg"
                            title="Eliminar categoría"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Modo de Periodo */}
          <div className="bg-[#f9f9f9] border border-[#c0c9bb]/60 p-5 rounded-xl shadow-inner-custom mt-6">
            <h3 className="font-bold text-sm text-[#00450d] uppercase tracking-wider mb-3">Modo de Periodo</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#717a6d] uppercase">Tipo de Periodo</label>
              <select
                value={catalogs.periodoMode || 'semanal'}
                onChange={(e) => {
                  const updated = { ...catalogs, periodoMode: e.target.value as 'semanal' | 'quincenal' };
                  onUpdateCatalogs(updated);
                  localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
                }}
                disabled={userRole === 'visor'}
                className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-bold text-[#1a1c1c] focus:border-[#00450d] focus:ring-0 bg-white disabled:opacity-50"
              >
                <option value="semanal">Semanal (4-5 semanas)</option>
                <option value="quincenal">Quincenal (2 quincenas)</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* Configuration of Master Catalogs (Locations, Species, Activities) */}
      <section className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4.5 h-4.5 text-[#00450d]" />
          <h3 className="font-bold text-sm text-[#1a1c1c] uppercase tracking-wider">Tablas Maestras & Catálogos</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ubicaciones */}
          <div className="bg-white border border-[#c0c9bb]/55 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-[#717a6d] uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-4 h-4 text-[#00450d]" /> Ubicaciones (Zonas/Viveros)
              </h4>
              {userRole === 'direccion' && (
                <button
                  onClick={() => setShowAddCatalogItem({ type: 'location' })}
                  className="p-1 px-2.5 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-xs font-semibold rounded-lg text-[#1a1c1c]"
                >
                  +
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {catalogs.locations.map((loc, i) => (
                <span key={i} className="relative px-3 py-1.5 bg-[#f9f9f9] border border-[#c0c9bb]/50 rounded-lg text-xs font-medium text-[#1a1c1c] flex items-center gap-1 group pr-6">
                  <MapPin className="w-3 h-3 text-[#717a6d]" /> {loc}
                  {userRole === 'direccion' && (
                    <button
                      onClick={() => {
                        if(confirm(`¿Eliminar ubicación: ${loc}?`)) {
                          const updated = { ...catalogs, locations: catalogs.locations.filter((_, idx) => idx !== i) };
                          onUpdateCatalogs(updated);
                          localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#ffdad6] hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white rounded-full flex items-center justify-center transition-all"
                      title="Eliminar"
                    >
                      <span className="text-[10px] leading-none mb-0.5">×</span>
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Especies */}
          <div className="bg-white border border-[#c0c9bb]/55 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-[#717a6d] uppercase tracking-wider flex items-center gap-1">
                <Leaf className="w-4 h-4 text-[#00450d]" /> Especies Cultivadas
              </h4>
              {userRole === 'direccion' && (
                <button
                  onClick={() => setShowAddCatalogItem({ type: 'specie' })}
                  className="p-1 px-2.5 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-xs font-semibold rounded-lg text-[#1a1c1c]"
                >
                  +
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {catalogs.species.map((sp, i) => (
                <span key={i} className="relative px-3 py-1.5 bg-[#f9f9f9] border border-[#c0c9bb]/50 rounded-lg text-xs font-medium text-[#1a1c1c] flex items-center gap-1 group pr-6">
                  <Leaf className="w-3 h-3 text-[#717a6d]" /> {sp}
                  {userRole === 'direccion' && (
                    <button
                      onClick={() => {
                        if(confirm(`¿Eliminar especie: ${sp}?`)) {
                          const updated = { ...catalogs, species: catalogs.species.filter((_, idx) => idx !== i) };
                          onUpdateCatalogs(updated);
                          localStorage.setItem('bobadilla_config_timestamp', String(Date.now()));
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#ffdad6] hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white rounded-full flex items-center justify-center transition-all"
                      title="Eliminar"
                    >
                      <span className="text-[10px] leading-none mb-0.5">×</span>
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Add Worker detail POPUP SHEET */}
      {showWorkerModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-white border border-[#c0c9bb] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-sm font-bold text-[#00450d] mb-4 uppercase tracking-wider">
              {editingWorkerId ? 'Modificar Ficha de Trabajador' : 'Añadir Ficha de Trabajador'}
            </h3>

            <form onSubmit={handleSaveWorker} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#717a6d] uppercase">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={workerFormData.name}
                  onChange={(e) => setWorkerFormData({ ...workerFormData, name: e.target.value })}
                  className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                  placeholder="Ej: Ricardo Mendoza"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Legajo</label>
                  <input
                    type="text"
                    required
                    value={workerFormData.legajo}
                    onChange={(e) => setWorkerFormData({ ...workerFormData, legajo: e.target.value })}
                    className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                    placeholder="Ej: #4402"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Categoría</label>
                  <select
                    value={workerFormData.category}
                    onChange={(e) => {
                      const selCat = catalogs.categories.find(c => c.name === e.target.value);
                      setWorkerFormData({ 
                        ...workerFormData, 
                        category: e.target.value,
                        hourlyRate: selCat?.defaultRate || 4000
                      });
                    }}
                    className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                  >
                    {catalogs.categories.map((c, idx) => (
                      <option key={idx} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">DNI</label>
                  <input
                    type="number"
                    value={workerFormData.dni}
                    onChange={(e) => setWorkerFormData({ ...workerFormData, dni: e.target.value })}
                    className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                    placeholder="Ej: 30123456"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">CUIT</label>
                  <input
                    type="text"
                    value={workerFormData.cuit}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9-]/g, '');
                      setWorkerFormData({ ...workerFormData, cuit: val });
                    }}
                    className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                    placeholder="Ej: 20-30123456-1"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#717a6d] uppercase">Cuenta Bancaria (CBU / Alias)</label>
                <input
                  type="text"
                  value={workerFormData.bankAccount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9-/]/g, '');
                    setWorkerFormData({ ...workerFormData, bankAccount: val });
                  }}
                  className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-semibold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                  placeholder="Ej: 0140000000000000000000 o 123-456/7"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#717a6d] uppercase">Régimen Tarifario</label>
                <select
                  value={workerFormData.regime}
                  onChange={(e) => setWorkerFormData({ ...workerFormData, regime: e.target.value as any })}
                  className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs font-bold focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9]"
                >
                  <option value="temporal">Temporal (Liquidación Semanal)</option>
                  <option value="permanente">Permanente (Sueldo mensual por hora)</option>
                  <option value="mensualizado">Mensualizado (Sueldo fijo mensual)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Precio Hora ($)</label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={workerFormData.regime === 'mensualizado'}
                    value={workerFormData.hourlyRate}
                    onChange={(e) => setWorkerFormData({ ...workerFormData, hourlyRate: Number(e.target.value) })}
                    className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9] disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Sueldo Fijo Mensual</label>
                  <input
                    type="number"
                    disabled={workerFormData.regime !== 'mensualizado'}
                    value={workerFormData.fixedSalary}
                    onChange={(e) => setWorkerFormData({ ...workerFormData, fixedSalary: Number(e.target.value) })}
                    className="h-11 border border-[#c0c9bb] rounded-xl px-4 text-xs focus:border-[#00450d] focus:ring-0 bg-[#f9f9f9] disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 py-2">
                <input
                  type="checkbox"
                  id="chk-active"
                  checked={workerFormData.isActive}
                  onChange={(e) => setWorkerFormData({ ...workerFormData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-[#00450d] border-[#c0c9bb]"
                />
                <label htmlFor="chk-active" className="text-xs font-semibold text-[#1a1c1c] cursor-pointer">Trabajador Activo en Campo</label>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#00450d] text-white hover:bg-[#002203] font-bold text-xs rounded-xl shadow-md transition-all uppercase"
                >
                  Guardar Ficha
                </button>
                <button
                  type="button"
                  onClick={() => setShowWorkerModal(false)}
                  className="py-2.5 px-5 border-2 border-[#c0c9bb] hover:bg-[#f3f3f3] text-[#717a6d] font-bold text-xs rounded-xl transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add static catalogue tag item selector sheet */}
      {showAddCatalogItem.type && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-white border border-[#c0c9bb] rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <h3 className="text-sm font-bold text-[#00450d] mb-4 uppercase tracking-wider">
              Añadir {showAddCatalogItem.type === 'location' ? 'Ubicación' : showAddCatalogItem.type === 'specie' ? 'Especie' : showAddCatalogItem.type === 'activity' ? 'Actividad' : 'Categoría / Rol'}
            </h3>
            
            <div className="flex flex-col gap-3 mb-6">
              <input
                type="text"
                autoFocus
                value={newCatalogItemText}
                onChange={(e) => setNewCatalogItemText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCatalogItemSubmit()}
                placeholder={showAddCatalogItem.type === 'category' ? "Nombre del Rol..." : "Nombre del ítem..."}
                className="h-10 px-3 text-xs border border-[#c0c9bb] rounded-lg focus:border-[#00450d] outline-none"
              />
              {showAddCatalogItem.type === 'category' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#717a6d] uppercase">Tarifa por Hora ($)</label>
                  <input
                    type="number"
                    value={newCategoryRate}
                    onChange={(e) => setNewCategoryRate(Number(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCatalogItemSubmit()}
                    placeholder="Tarifa por hora..."
                    className="h-10 px-3 text-xs border border-[#c0c9bb] rounded-lg focus:border-[#00450d] outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddCatalogItemSubmit}
                className="flex-1 py-2.5 bg-[#00450d] text-white hover:bg-[#002203] font-bold text-xs rounded-xl shadow-md transition-all uppercase"
              >
                Guardar Elemento
              </button>
              <button
                type="button"
                onClick={() => { setNewCatalogItemText(''); setShowAddCatalogItem({ type: null }); }}
                className="py-2.5 px-4 border-2 border-[#c0c9bb] hover:bg-[#f3f3f3] text-[#717a6d] font-bold text-xs rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
