import React, { useState, useEffect } from 'react';
import { Worker, Entry, MasterCatalogs } from './types';
import { DEFAULT_WORKERS, DEFAULT_CATALOGS } from './initialData';
import Dashboard from './components/Dashboard';
import Entries from './components/Entries';
import AddEntry from './components/AddEntry';
import Payroll from './components/Payroll';
import Config from './components/Config';
import Login from './components/Login';
import {
  performBidirectionalSync,
  fetchServerEntries,
  getCurrentSupabaseUser,
  logoutSupabaseUser,
  SupabaseUser,
  fetchPendingWhatsAppMessages
} from './supabaseClient';
import { WhatsAppMessages } from './components/WhatsAppMessages';
import { runWorkerDedupeMigration } from './migrations';

// Lucide-Icons
import { 
  LayoutDashboard, 
  ClipboardList, 
  Plus, 
  CreditCard, 
  Settings, 
  LogOut, 
  Menu, 
  HelpCircle, 
  Bell, 
  User,  
  X, 
  Trees,
  Sprout,
  Users,
  TrendingUp,
  RefreshCw,
  MessageSquare
} from 'lucide-react';

export default function App() {
  // Navigation
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [catalogs, setCatalogs] = useState<MasterCatalogs>(DEFAULT_CATALOGS);
  
  // WhatsApp Messages State
  const [pendingMessagesCount, setPendingMessagesCount] = useState<number>(0);
  
  // Alert Notifications
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);

  // Check auth session on startup
  useEffect(() => {
    const initAuth = async () => {
      try {
        // El inicio de sesión anónimo está deshabilitado en el proyecto de
        // Supabase, por lo que NO intentamos un auto-login anónimo (antes se
        // intentaba y fallaba en silencio). Si no hay sesión activa, el usuario
        // debe autenticarse con email/contraseña en la pantalla de Login.
        const user = await getCurrentSupabaseUser();

        setCurrentUser(user);
        
        // Fetch initial pending messages count if authorized
        if (user && user.role !== 'visor') {
          const msgs = await fetchPendingWhatsAppMessages();
          setPendingMessagesCount(msgs.length);
        }
      } catch (e) {
        console.warn('Authentication startup check deferred', e);
      } finally {
        setCheckingSession(false);
      }
    };
    initAuth();
  }, []);

  // Auto load state from localStorage on mount
  useEffect(() => {
    // 0. Migración única: consolidar workers duplicados creados por la versión
    // anterior del sync (un worker con id aleatorio por cada sincronización) y
    // remapear los worker_id de las entradas hacia el worker canónico.
    try {
      const result = runWorkerDedupeMigration();
      if (result.ran && result.removedWorkers > 0) {
        console.log(`[Migración] Workers duplicados fusionados: ${result.removedWorkers} (en ${result.groups} nombres), entradas remapeadas: ${result.remappedEntries}`);
      }
    } catch (e) {
      console.warn('Migración de limpieza de workers omitida:', e);
    }

    // 1. Workers
    const storedWorkers = localStorage.getItem('bobadilla_workers');
    if (storedWorkers) {
      let parsedWorkers = JSON.parse(storedWorkers);
      // Migration for fixed salaries
      let patched = false;
      parsedWorkers = parsedWorkers.map((w: any) => {
        if (w.name === 'Segura Luis Antonio' && (!w.fixedSalary || w.fixedSalary === 0)) {
          patched = true;
          return { ...w, regime: 'mensualizado', fixedSalary: 1500000 };
        }
        if (w.name === 'Paz Federico' && (!w.fixedSalary || w.fixedSalary === 0)) {
          patched = true;
          return { ...w, regime: 'mensualizado', fixedSalary: 1200000, category: 'Encargado Invernadero' };
        }
        return w;
      });
      if (patched) {
        localStorage.setItem('bobadilla_workers', JSON.stringify(parsedWorkers));
      }
      parsedWorkers.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setWorkers(parsedWorkers);
    } else {
      const defaultSorted = [...DEFAULT_WORKERS].sort((a, b) => a.name.localeCompare(b.name));
      setWorkers(defaultSorted);
      localStorage.setItem('bobadilla_workers', JSON.stringify(defaultSorted));
    }

    // 2. Catalogs
    const storedCatalogs = localStorage.getItem('bobadilla_catalogs');
    if (storedCatalogs) {
      const parsed = JSON.parse(storedCatalogs);
      
      // Fix categories if they are strings or old objects (migration)
      if (parsed.categories && parsed.categories.length > 0) {
        if (typeof parsed.categories[0] === 'string') {
          parsed.categories = parsed.categories.map((c: string) => ({
            name: c,
            defaultRate: 4500,
            description: 'Nómina agropecuaria'
          }));
          localStorage.setItem('bobadilla_catalogs', JSON.stringify(parsed));
        } else if (parsed.categories[0].nombre) {
          // It's the old object format { nombre, precioHora }
          parsed.categories = parsed.categories.map((c: any) => ({
            name: c.nombre || 'Sin nombre',
            defaultRate: c.precioHora || 4500,
            description: 'Nómina agropecuaria'
          }));
          localStorage.setItem('bobadilla_catalogs', JSON.stringify(parsed));
        }
      }

      if (parsed.species && parsed.species.includes('Quercus Ilex')) {
        setCatalogs(DEFAULT_CATALOGS);
        localStorage.setItem('bobadilla_catalogs', JSON.stringify(DEFAULT_CATALOGS));
      } else {
        setCatalogs(parsed);
      }
    } else {
      setCatalogs(DEFAULT_CATALOGS);
      localStorage.setItem('bobadilla_catalogs', JSON.stringify(DEFAULT_CATALOGS));
    }

    // 3. Entries (Pre-load initial simulation entries to match screens)
    const storedEntries = localStorage.getItem('bobadilla_entries');
    const initialMockEntries: Entry[] = [
      {
        id: 'ent_mock1',
        worker_id: 'w4', // Juan Pérez
        date: '2026-05-24',
        type: 'Trabajos al día',
        location: 'Finca',
        quadro: 'B-12',
        specie: 'Adara',
        activity: 'Plantacion de Estacas',
        hours: 8.0,
        quantity: 150,
        amount: 0, // Auto-computes as rate * hours
        rate: 4000,
        updated_at: new Date().toISOString()
      },
      {
        id: 'ent_mock2',
        worker_id: 'w5', // María García
        date: '2026-05-23',
        type: 'Trabajos al tanto',
        location: 'CLA',
        quadro: 'C-24',
        specie: 'Durazno',
        activity: 'Cosecha de Carozo',
        hours: 8.0,
        quantity: 24,
        amount: 55000, // Fixed amount
        rate: 4500,
        updated_at: new Date().toISOString()
      },
      {
        id: 'ent_mock3',
        worker_id: 'w6', // Carlos Ruiz
        date: '2026-05-23',
        type: 'Trabajos al día',
        location: 'Capacho',
        quadro: 'Norte-2',
        specie: 'Nogal',
        activity: 'Desmalezado manual',
        hours: 4.5,
        quantity: 0,
        amount: 0,
        rate: 4000,
        updated_at: new Date().toISOString()
      },
      {
        id: 'ent_mock4',
        worker_id: 'w4', // Juan Pérez
        date: '2026-05-22',
        type: 'Trabajos al día',
        location: 'Finca',
        quadro: 'Lote 4',
        specie: 'Almendra',
        activity: 'Fertilización',
        hours: 6.0,
        quantity: 0,
        amount: 0,
        rate: 4000,
        updated_at: new Date().toISOString()
      }
    ];

    if (storedEntries) {
      const parsed = JSON.parse(storedEntries);
      setEntries(parsed);
    } else {
      setEntries(initialMockEntries);
      localStorage.setItem('bobadilla_entries', JSON.stringify(initialMockEntries));
    }
  }, []);

  // Bidirectional synchronizer trigger when logged-in user changes
  useEffect(() => {
    if (currentUser) {
      performBidirectionalSync().then(async (res) => {
        if (!res.success) {
          if (res.message.includes('Versión antigua')) {
            alert(res.message);
            window.location.reload();
          } else {
            setNotifications(prev => [...prev, res.message]);
            setShowAlertModal(true);
          }
        }
        const syncedWorkers = localStorage.getItem('bobadilla_workers');
        if (syncedWorkers) {
          const parsed = JSON.parse(syncedWorkers);
          parsed.sort((a: any, b: any) => a.name.localeCompare(b.name));
          setWorkers(parsed);
        }
        const syncedCatalogs = localStorage.getItem('bobadilla_catalogs');
        if (syncedCatalogs) {
          setCatalogs(JSON.parse(syncedCatalogs));
        }
        // CAPA 1: tras subir lo pendiente, mostramos la verdad del servidor.
        await refreshFromServer();
      }).catch(err => {
        console.log('Startup sync deferred (local mode active):', err);
      });
    }
  }, [currentUser]);

  // CAPA 1 — Fuente de verdad en el servidor.
  // Lee TODOS los registros directo de Supabase y los muestra, de modo que
  // todos los roles que ven el 100% (dirección, administración, visor) muestren
  // exactamente lo mismo, sin depender de la foto vieja del localStorage local.
  const refreshFromServer = async () => {
    const res = await fetchServerEntries();
    if (res.success) {
      setEntries(res.entries);
      // El mapeo pudo materializar trabajadores "wsync"/desconocido en localStorage.
      const syncedWorkers = localStorage.getItem('bobadilla_workers');
      if (syncedWorkers) {
        const parsed = JSON.parse(syncedWorkers);
        parsed.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setWorkers(parsed);
      }
    } else if (res.message) {
      console.warn('No se pudo leer del servidor (se mantiene la caché local):', res.message);
    }
  };

  // Sync callbacks
  const handleAddEntries = (newEntriesList: Entry[]) => {
    if (!currentUser) return;
    const stampedList = newEntriesList.map(item => ({
      ...item,
      created_by: currentUser.id,
      // CAPA 2: clave de idempotencia única e irrepetible por parte. Se genera una
      // sola vez acá (único embudo de alta). La base la usa para reconocer "este
      // parte ya existe" y actualizarlo en lugar de duplicarlo.
      client_uuid: item.client_uuid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    }));
    // Actualización FUNCIONAL sobre el estado previo: si otro handler acaba de
    // modificar entries en este mismo tick (p. ej. cerrar período llama a
    // onLockEntries y luego a onAddEntries), partir de la variable `entries`
    // del closure pisaría esos cambios (se perdían los locked del cierre).
    setEntries(prev => {
      const updated = [...prev, ...stampedList];
      localStorage.setItem('bobadilla_entries', JSON.stringify(updated));
      return updated;
    });

    // Background sync try
    performBidirectionalSync().then(async res => {
      if (!res.success) {
        setNotifications(prev => [...prev, `Error sync: ${res.message}`]);
        setShowAlertModal(true);
      }
      await refreshFromServer();
    }).catch(() => {});
  };

  const handleUpdateEntry = (id: string, updatedFields: Partial<Entry>) => {
    if (!currentUser) return;
    setEntries(prev => {
      const updated = prev.map(e => (e.id === id ? { ...e, ...updatedFields } : e));
      localStorage.setItem('bobadilla_entries', JSON.stringify(updated));
      return updated;
    });

    // Background sync try
    performBidirectionalSync().then(async res => {
      if (!res.success) {
        setNotifications(prev => [...prev, `Error sync: ${res.message}`]);
        setShowAlertModal(true);
      }
      await refreshFromServer();
    }).catch(() => {});
  };

  const handleDeleteEntry = (id: string) => {
    if (!currentUser) return;
    // Soft delete locally
    setEntries(prev => {
      const updated = prev.map(e =>
        e.id === id ? { ...e, deleted: true, updated_at: new Date().toISOString() } : e
      );
      localStorage.setItem('bobadilla_entries', JSON.stringify(updated));
      return updated;
    });

    // Background sync try
    performBidirectionalSync().then(async res => {
      if (!res.success) {
        setNotifications(prev => [...prev, `Error sync: ${res.message}`]);
        setShowAlertModal(true);
      }
      await refreshFromServer();
    }).catch(() => {});
  };

  const handleUpdateWorkers = (newWorkers: Worker[]) => {
    const sorted = [...newWorkers].sort((a, b) => a.name.localeCompare(b.name));
    setWorkers(sorted);
    localStorage.setItem('bobadilla_workers', JSON.stringify(sorted));
  };

  const handleUpdateCatalogs = (newCatalogs: MasterCatalogs) => {
    setCatalogs(newCatalogs);
    localStorage.setItem('bobadilla_catalogs', JSON.stringify(newCatalogs));
  };

  const handleLockEntries = (entryIds: string[]) => {
    const idSet = new Set(entryIds);
    setEntries(prev => {
      const updated = prev.map(e =>
        idSet.has(e.id) ? { ...e, locked: true, updated_at: new Date().toISOString() } : e
      );
      localStorage.setItem('bobadilla_entries', JSON.stringify(updated));
      return updated;
    });
  };

  const handleUpdateMultipleEntries = (updates: {id: string, changes: Partial<Entry>}[]) => {
    const byId = new Map(updates.map(u => [u.id, u.changes]));
    setEntries(prev => {
      const updated = prev.map(e => {
        const changes = byId.get(e.id);
        return changes ? { ...e, ...changes, updated_at: new Date().toISOString() } : e;
      });
      localStorage.setItem('bobadilla_entries', JSON.stringify(updated));
      return updated;
    });
  };

  const handleLogout = async () => {
    try {
      await logoutSupabaseUser();
      setCurrentUser(null);
      setCurrentView('dashboard');
    } catch (e) {
      console.error('Logout error', e);
    }
  };

  const getActiveViewComponent = () => {
    if (!currentUser) {
      return <Login onSuccess={(user) => { setCurrentUser(user); setCurrentView('dashboard'); }} />;
    }
    switch (currentView) {
      case 'dashboard':
        return <Dashboard entries={entries} workers={workers} onNavigate={setCurrentView} userRole={currentUser.role} currentUserId={currentUser.id} />;
      case 'entries':
        return (
          <Entries 
            entries={entries} 
            workers={workers} 
            catalogs={catalogs} 
            onUpdateEntry={handleUpdateEntry} 
            onDeleteEntry={handleDeleteEntry} 
            userRole={currentUser.role}
            currentUserId={currentUser.id}
          />
        );
      case 'add':
        return (
          <AddEntry 
            workers={workers} 
            catalogs={catalogs} 
            onAddEntries={handleAddEntries} 
            onNavigate={setCurrentView} 
            userRole={currentUser.role}
          />
        );
      case 'payroll':
        // Liquidaciones: totalmente bloqueado para el encargado (defensa en
        // profundidad, además de ocultar la pestaña en el menú).
        if (currentUser.role === 'encargado') {
          return <Dashboard entries={entries} workers={workers} onNavigate={setCurrentView} userRole={currentUser.role} currentUserId={currentUser.id} />;
        }
        return <Payroll
          entries={entries}
          workers={workers}
          catalogs={catalogs}
          periodoMode={catalogs.periodoMode}
          onLockEntries={handleLockEntries}
          onUpdateMultipleEntries={handleUpdateMultipleEntries}
          onAddEntries={handleAddEntries}
        />;
      case 'messages':
        return (
          <WhatsAppMessages 
            onAddEntries={handleAddEntries} 
            workers={workers} 
            catalogs={catalogs} 
          />
        );
      case 'config':
        // Configuración: totalmente bloqueada para el encargado.
        if (currentUser.role === 'encargado') {
          return <Dashboard entries={entries} workers={workers} onNavigate={setCurrentView} userRole={currentUser.role} currentUserId={currentUser.id} />;
        }
        return (
          <Config
            workers={workers}
            catalogs={catalogs}
            onUpdateWorkers={handleUpdateWorkers}
            onUpdateCatalogs={handleUpdateCatalogs}
            userRole={currentUser.role}
          />
        );
      default:
        return <Dashboard entries={entries} workers={workers} onNavigate={setCurrentView} userRole={currentUser.role} currentUserId={currentUser.id} />;
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9f9]" id="checking-session-overlay">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#00450d] border-t-transparent"></div>
          <p className="text-[#717a6d] text-xs font-bold uppercase tracking-wider">Comprobando credenciales y sesión...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onSuccess={(user) => { setCurrentUser(user); setCurrentView('dashboard'); }} />;
  }

  return (
    <div className="flex bg-[#f9f9f9] min-h-screen text-[#1a1c1c] font-sans antialiased">
      
      {/* Desktop Floating Sidebar container */}
      <aside className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 bg-[#f3f3f3] border-r border-[#c0c9bb]/65 py-6 px-4 gap-4 z-40">
        <div className="px-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#00450d] text-white rounded-xl">
              <Sprout className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-bold text-sm text-[#00450d] leading-none">Bobadilla Viveros</h1>
              <p className="text-[10px] text-[#717a6d] font-semibold tracking-wider uppercase mt-1">Gestión de Cultivos</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1.5 pt-2">
          {/* Dashboard tab */}
          <button
            onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
              currentView === 'dashboard' 
                ? 'bg-[#98f994] text-[#0c7521] shadow-sm' 
                : 'text-[#717a6d] hover:bg-[#e2e2e2]/60 hover:text-[#1a1c1c]'
            }`}
          >
            <LayoutDashboard className="w-4.5 h-4.5" />
            <span>Dashboard</span>
          </button>

          {/* Registros Tab */}
          <button
            onClick={() => { setCurrentView('entries'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
              currentView === 'entries' 
                ? 'bg-[#98f994] text-[#0c7521] shadow-sm' 
                : 'text-[#717a6d] hover:bg-[#e2e2e2]/60 hover:text-[#1a1c1c]'
            }`}
          >
            <ClipboardList className="w-4.5 h-4.5" />
            <span>Registros de Labores</span>
          </button>

          {/* Liquidación Tab */}
          {currentUser?.role !== 'encargado' && (
            <button
              onClick={() => { setCurrentView('payroll'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                currentView === 'payroll' 
                  ? 'bg-[#98f994] text-[#0c7521] shadow-sm' 
                  : 'text-[#717a6d] hover:bg-[#e2e2e2]/60 hover:text-[#1a1c1c]'
              }`}
            >
              <CreditCard className="w-4.5 h-4.5" />
              <span>Liquidación de Haberes</span>
            </button>
          )}

          {/* Mensajes WhatsApp Tab */}
          {currentUser?.role !== 'visor' && (
            <button
              onClick={() => { 
                setCurrentView('messages'); 
                setMobileMenuOpen(false);
                // Refetch count on click
                fetchPendingWhatsAppMessages().then(msgs => setPendingMessagesCount(msgs.length));
              }}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                currentView === 'messages' 
                  ? 'bg-[#98f994] text-[#0c7521] shadow-sm' 
                  : 'text-[#717a6d] hover:bg-[#e2e2e2]/60 hover:text-[#1a1c1c]'
              }`}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4.5 h-4.5" />
                <span>Mensajes</span>
              </div>
              {pendingMessagesCount > 0 && (
                <span className="bg-[#ba1a1a] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {pendingMessagesCount}
                </span>
              )}
            </button>
          )}

          {/* Personal config Tab */}
          {currentUser?.role !== 'encargado' && (
            <button
              onClick={() => { setCurrentView('config'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                currentView === 'config' 
                  ? 'bg-[#98f994] text-[#0c7521] shadow-sm' 
                  : 'text-[#717a6d] hover:bg-[#e2e2e2]/60 hover:text-[#1a1c1c]'
              }`}
            >
              <Settings className="w-4.5 h-4.5" />
              <span>Configuración General</span>
            </button>
          )}

          {/* Bulk loading launch button */}
          {currentUser?.role !== 'visor' && (
            <div className="mt-8 px-2">
              <button
                onClick={() => { setCurrentView('add'); setMobileMenuOpen(false); }}
                className="w-full py-3 bg-[#00450d] hover:bg-[#002203] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" /> Nuevo Registro
              </button>
            </div>
          )}
        </nav>

        {/* Footer info in sidebar */}
        <footer className="border-t border-[#c0c9bb]/50 pt-4 flex flex-col gap-1.5">
          <div className="flex items-center gap-3 px-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#006e1c] animate-pulse" />
            <p className="text-[10px] font-bold text-[#717a6d] uppercase tracking-wide">Modo Offline Activo</p>
          </div>
          <p className="text-[9px] text-[#717a6d] px-2">v2.7.2 • Sincronizado Supabase</p>
        </footer>
      </aside>

      {/* Main Container Shell */}
      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#c0c9bb]/65 px-6 py-3.5 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger menu toggle */}
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 hover:bg-[#f3f3f3] rounded-full text-[#1a1c1c] focus:outline-none"
            >
              <Menu className="w-6 h-6" />
            </button>
            <span className="lg:hidden p-1.5 bg-[#00450d] text-white rounded-lg">
              <Sprout className="w-4.5 h-4.5" />
            </span>
            <div className="lg:hidden">
              <h1 className="font-black text-xs text-[#00450d] tracking-tight">Bobadilla</h1>
            </div>
            <h2 className="hidden lg:block text-xs font-bold text-[#717a6d] uppercase tracking-widest bg-[#f3f3f3] px-3 py-1 rounded-full border border-[#c0c9bb]/30">
              Operativo Principal
            </h2>
          </div>

          {/* Quick interactions */}
          <div className="flex items-center gap-3">
            {/* Notifications Alert Bell */}
            <button 
              onClick={() => setShowAlertModal(true)}
              className="p-2 text-[#717a6d] hover:bg-[#f3f3f3] rounded-full relative transition-colors"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ba1a1a] rounded-full" />
              )}
            </button>

            {/* Real Operating User profile with Logout options */}
            {currentUser && (
              <div className="flex items-center gap-3 border-l border-[#c0c9bb]/40 pl-3.5">
                <div className="hidden sm:flex flex-col text-left leading-tight">
                  <span className="text-xs font-bold text-[#1a1c1c] max-w-[150px] truncate" title={currentUser.email}>
                    {currentUser.email.split('@')[0]}
                  </span>
                  <span className="text-[9px] text-[#006e1c] font-black uppercase tracking-wider">
                    {currentUser.role === 'direccion' ? 'Dirección' : currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'encargado' ? 'Encargado' : 'Visor (Solo Lectura)'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (window.confirm("¿Problemas con la App? Esto limpiará la memoria y descargará la última versión. Se perderán los registros que no hayas sincronizado. ¿Continuar?")) {
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
                    title="Forzar actualización y limpiar caché"
                    className="p-1 px-2 bg-[#f3f3f3] hover:bg-[#e2e2e2] text-[#42473e] rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden sm:inline text-[10px] font-bold">Refrescar</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="p-1 px-2.5 bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#ba1a1a] rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-[10px] font-bold hidden sm:inline">Salir</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content Board Canvas */}
        <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full pb-20">
          {getActiveViewComponent()}
        </div>

        {/* Global Footer */}
        <footer className="bg-white border-t border-[#c0c9bb]/65 py-4 px-8 mt-auto flex flex-col md:flex-row justify-between items-center gap-2 pb-10 lg:pb-4">
          <p className="text-xs text-[#717a6d]">
            © 2026 <span className="font-bold text-[#00450d]">Bobadilla Viveros</span>. Todos los derechos reservados.
          </p>
          <div className="flex gap-4 text-xs font-bold text-[#717a6d]">
            <a href="#" className="hover:text-[#00450d] transition-colors">Soporte Campo</a>
            <span>•</span>
            <a href="#" className="hover:text-[#00450d] transition-colors">Privacidad de Datos</a>
            <span>•</span>
            <a href="#" className="hover:text-[#00450d] transition-colors">Términos de Licencia</a>
          </div>
        </footer>
      </main>

      {/* Mobile Drawer Slide-out Nav */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div 
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity" 
          />
          {/* Menu Drawer */}
          <div className="relative flex flex-col w-64 max-w-xs bg-[#f3f3f3] h-full p-6 justify-between border-r border-[#c0c9bb]/65 shadow-2xl animate-slide-right">
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-5 right-5 p-1.5 hover:bg-[#e2e2e2] rounded-full text-[#717a6d]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-[#c0c9bb]/30 pb-4">
                <span className="p-1.5 bg-[#00450d] text-white rounded-lg">
                  <Sprout className="w-5 h-5" />
                </span>
                <h1 className="font-bold text-sm text-[#00450d]">Bobadilla</h1>
              </div>

              <nav className="flex flex-col gap-1.5">
                <button
                  onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'dashboard' 
                      ? 'bg-[#98f994] text-[#0c7521]' 
                      : 'text-[#717a6d] hover:bg-[#e2e2e2]'
                  }`}
                >
                  <LayoutDashboard className="w-4.5 h-4.5" />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => { setCurrentView('entries'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'entries' 
                      ? 'bg-[#98f994] text-[#0c7521]' 
                      : 'text-[#717a6d] hover:bg-[#e2e2e2]'
                  }`}
                >
                  <ClipboardList className="w-4.5 h-4.5" />
                  <span>Registros de Labores</span>
                </button>

                {currentUser?.role !== 'visor' && (
                  <button
                    onClick={() => { setCurrentView('add'); setMobileMenuOpen(false); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      currentView === 'add' 
                        ? 'bg-[#98f994] text-[#0c7521]' 
                        : 'text-[#717a6d] hover:bg-[#e2e2e2]'
                    }`}
                  >
                    <Plus className="w-4.5 h-4.5" />
                    <span>Cargar Parte Diario</span>
                  </button>
                )}

                {currentUser?.role !== 'encargado' && (
                  <button
                    onClick={() => { setCurrentView('payroll'); setMobileMenuOpen(false); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      currentView === 'payroll' 
                        ? 'bg-[#98f994] text-[#0c7521]' 
                        : 'text-[#717a6d] hover:bg-[#e2e2e2]'
                    }`}
                  >
                    <CreditCard className="w-4.5 h-4.5" />
                    <span>Liquidaciones</span>
                  </button>
                )}

                {currentUser?.role !== 'visor' && (
                  <button
                    onClick={() => { 
                      setCurrentView('messages'); 
                      setMobileMenuOpen(false);
                      fetchPendingWhatsAppMessages().then(msgs => setPendingMessagesCount(msgs.length));
                    }}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      currentView === 'messages' 
                        ? 'bg-[#98f994] text-[#0c7521]' 
                        : 'text-[#717a6d] hover:bg-[#e2e2e2]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4.5 h-4.5" />
                      <span>Mensajes</span>
                    </div>
                    {pendingMessagesCount > 0 && (
                      <span className="bg-[#ba1a1a] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                        {pendingMessagesCount}
                      </span>
                    )}
                  </button>
                )}

                {currentUser?.role !== 'encargado' && (
                  <button
                    onClick={() => { setCurrentView('config'); setMobileMenuOpen(false); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      currentView === 'config' 
                        ? 'bg-[#98f994] text-[#0c7521]' 
                        : 'text-[#717a6d] hover:bg-[#e2e2e2]'
                    }`}
                  >
                    <Settings className="w-4.5 h-4.5" />
                    <span>Configuración</span>
                  </button>
                )}
              </nav>
            </div>

            <footer className="border-t border-[#c0c9bb]/30 pt-4 flex flex-col gap-2 text-[10px] text-[#717a6d]">
              <div>
                <p className="font-bold">Bobadilla Viveros v2.7.2</p>
                <p>Sincronización Supabase CDN</p>
              </div>
              <button
                onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                className="w-full mt-1.5 py-2.5 bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#ba1a1a] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <LogOut className="w-4 h-4" /> Cerrar Sesión
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Notifications Alert Modal Popover Sheet */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-white border border-[#c0c9bb] rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowAlertModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-[#f3f3f3] text-[#717a6d]"
            >
              <X className="w-4.5 h-4.5" />
            </button>
            <h3 className="text-xs font-bold text-[#ba1a1a] uppercase tracking-wider mb-4">
              Novedades del Vivero
            </h3>

            <div className="space-y-4">
              {notifications.map((n, idx) => (
                <div key={idx} className="p-3 bg-[#ffdad6]/40 border border-[#ffdad6] rounded-xl text-xs">
                  <p className="font-semibold text-[#93000a] leading-relaxed">{n}</p>
                </div>
              ))}
              
              <button
                type="button"
                onClick={() => setNotifications([])}
                className="w-full py-2 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-xs font-bold rounded-lg text-[#1a1c1c] mt-2 transition-colors"
              >
                Marcar todas como leídas
              </button>
              
              <button
                type="button"
                onClick={() => setShowAlertModal(false)}
                className="w-full py-2.5 bg-[#00450d] text-white font-bold text-xs rounded-xl hover:bg-[#002203] shadow-md uppercase mt-1"
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
