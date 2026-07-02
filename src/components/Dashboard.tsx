import React, { useState, useMemo } from 'react';
import { Entry, Worker, formatCurrency, localDateStr } from '../types';
import { Calendar, DollarSign, TrendingUp, Sparkles, Clock, AlertTriangle, UserCheck, CheckCircle2 } from 'lucide-react';

interface DashboardProps {
  entries: Entry[];
  workers: Worker[];
  onNavigate: (view: string) => void;
  userRole?: string;
  currentUserId?: string;
}

export default function Dashboard({ entries, workers, onNavigate, userRole, currentUserId }: DashboardProps) {
  const [timeframe, setTimeframe] = useState<'7days' | 'month'>('7days');

  // Helpers for metrics
  const activeEntries = useMemo(() => {
    return entries.filter(e => {
      if (e.deleted) return false;
      // El encargado está encapsulado: todas las métricas del Dashboard
      // (totales, gráfico y últimos registros) se calculan ÚNICAMENTE con los
      // partes que él mismo cargó, nunca con los totales de la empresa.
      if (userRole === 'encargado' && e.created_by !== currentUserId) return false;
      return true;
    });
  }, [entries, userRole, currentUserId]);

  // Calculations
  // Fecha LOCAL (no UTC): con toISOString, después de las 21:00 en Argentina
  // "hoy" pasaba a ser mañana y la tarjeta Registros Hoy quedaba en 0.
  const todayStr = useMemo(() => localDateStr(), []);

  const workerById = useMemo(() => new Map(workers.map(w => [w.id, w])), [workers]);

  const stats = useMemo(() => {
    const todayEntries = activeEntries.filter(e => e.date === todayStr);
    const todayCount = todayEntries.length;

    // Total hours
    const totalHours = activeEntries.reduce((sum, e) => sum + (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)), 0);

    // Total Period Cost (Bruto Total)
    const totalCost = activeEntries.reduce((sum, e) => {
      if (['Adelanto', 'Descuento', 'Bonificación'].includes(e.type)) {
        return sum; // Do not mix cash advances/deductions into the gross labor cost
      }
      return sum + (e.amount || 0);
    }, 0);

    return {
      todayCount,
      totalHours,
      totalCost
    };
  }, [activeEntries, todayStr]);

  // Dynamic calculation for chart based on timeframe
  const weeklyData = useMemo(() => {
    const daysNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    const daysCount = timeframe === 'month' ? 30 : 7;
    // Generate array of date strings (YYYY-MM-DD) ending today
    const dates = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push({
        dateStr: localDateStr(d),
        dayName: daysNames[d.getDay()],
        isToday: i === 0
      });
    }

    return dates.map(dInfo => {
      let hours = 0;
      let count = 0;
      
      activeEntries.forEach(e => {
        if (e.date === dInfo.dateStr) {
          hours += (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0));
          count += 1;
        }
      });
      
      return {
        name: dInfo.dayName,
        displayName: dInfo.isToday ? 'Hoy' : (timeframe === 'month' ? dInfo.dateStr.slice(-2) : dInfo.dayName), // En mes mostramos el número del día
        isToday: dInfo.isToday,
        hours,
        count
      };
    });
  }, [activeEntries, timeframe]);

  // Calculate maximum height for scaling
  const maxHoursInWeek = useMemo(() => {
    const max = Math.max(...weeklyData.map(d => d.hours), 1);
    return max;
  }, [weeklyData]);

  // Last actions feed
  const recentActions = useMemo(() => {
    // Take the 4 most recent inputs from the active list
    const sorted = [...activeEntries].sort((a, b) => b.id.localeCompare(a.id));
    return sorted.slice(0, 4);
  }, [activeEntries]);

  const getWorkerInitials = (workerId: string) => {
    const worker = workerById.get(workerId);
    if (!worker) return '??';
    const parts = worker.name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const getWorkerName = (workerId: string) => {
    return workerById.get(workerId)?.name || 'Trabajador';
  };

  return (
    <div className="space-y-6">
      {/* Operating Header */}
      <div className="header-container">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-[#00450d] to-[#006e1c] bg-clip-text text-transparent mb-1">
          Resumen Operativo
        </h3>
        <p className="text-sm text-[#717a6d]">
          Metas operativas, métricas y control en tiempo real de Bobadilla Viveros.
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Registros Hoy */}
        <article className="bg-[#f3f3f3]/60 border border-[#c0c9bb]/60 p-5 rounded-2xl flex flex-col justify-between transition-all hover:shadow-sm" id="card-today-registrations">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#98f994] rounded-xl text-[#0c7521] shadow-inner-custom">
              <Calendar className="w-5 h-5" />
            </span>
            <span className="px-2.5 py-0.5 bg-[#91d78a]/30 text-[#0c5216] rounded-full text-xs font-semibold">
              Hoy
            </span>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#717a6d] mb-1">
              Registros Hoy
            </h4>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-[#1a1c1c]">{stats.todayCount}</span>
              <span className="text-xs text-[#717a6d]">unidades de labor</span>
            </div>
          </div>
        </article>

        {/* Card 2: Horas Totales */}
        <article className="bg-[#f3f3f3]/60 border border-[#c0c9bb]/60 p-5 rounded-2xl flex flex-col justify-between transition-all hover:shadow-sm" id="card-total-hours">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#ffdf9e] rounded-xl text-[#5b4300] shadow-inner-custom">
              <Clock className="w-5 h-5" />
            </span>
            <span className="px-2.5 py-0.5 bg-[#c0c9bb] text-[#1a1c1c] rounded-full text-xs font-semibold">
              Meta: 160h
            </span>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#717a6d] mb-1">
              Horas de Trabajo
            </h4>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-[#1a1c1c]">{stats.totalHours.toLocaleString()}</span>
              <span className="text-xs text-[#717a6d]">horas acumuladas</span>
            </div>
          </div>
        </article>

        {/* Card 3: Costo Periodo */}
        <article className="bg-[#f3f3f3]/60 border border-[#c0c9bb]/60 p-5 rounded-2xl flex flex-col justify-between transition-all hover:shadow-sm" id="card-period-wage">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1b5e20] rounded-xl text-[#90d689] shadow-inner-custom">
              <DollarSign className="w-5 h-5" />
            </span>
            <span className="px-2.5 py-0.5 bg-[#ffdad6] text-[#93000a] rounded-full text-xs font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Costo
            </span>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#717a6d] mb-1">
              Costo Neto de Plantilla
            </h4>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-[#1a1c1c]">
                {formatCurrency(stats.totalCost)}
              </span>
              <span className="text-xs text-[#717a6d]">ARS</span>
            </div>
          </div>
        </article>
      </div>

      {/* Chart and Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Weekly Activities Chart Card */}
        <section className="lg:col-span-3 bg-white border border-[#c0c9bb]/50 p-6 rounded-2xl shadow-sm flex flex-col justify-between" id="section-weekly-chart">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-semibold text-[#1a1c1c] text-lg">Distribución de Carga Horaria</h4>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="text-xs border border-[#c0c9bb] bg-[#f9f9f9] rounded-lg px-2.5 py-1.5 focus:border-[#00450d] focus:ring-0 text-[#1a1c1c] outline-none font-semibold transition-colors"
            >
              <option value="7days">Últimos 7 días</option>
              <option value="month">Mes de Trabajo</option>
            </select>
          </div>

          {/* Bar Chart Graphics */}
          <div className="h-64 flex items-end justify-between gap-3 px-2 mt-4 relative">
            {weeklyData.map((d, idx) => {
              const heightPct = Math.max((d.hours / maxHoursInWeek) * 100, 3); // Minimum 3% to show a flat bar
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end relative">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-transform bg-[#2f3131] text-white text-[11px] font-semibold py-1 px-2 rounded shadow-md z-10 whitespace-nowrap pointer-events-none">
                    {d.hours} hrs ({d.count} u) {timeframe === 'month' && !d.isToday ? `- ${d.name}` : ''}
                  </div>
                  
                  {/* Visual Bar */}
                  <div 
                    className={`w-full rounded-t-lg transition-all duration-700 ease-out ${
                      d.isToday 
                        ? 'bg-gradient-to-t from-[#00450d] to-[#006e1c]' 
                        : 'bg-[#acf4a4] hover:bg-[#91d78a]'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className={`text-[11px] font-bold mt-1 ${d.isToday ? 'text-[#00450d]' : 'text-[#717a6d]'}`}>
                    {d.displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Actions Stream panel */}
        <section className="lg:col-span-2 bg-white border border-[#c0c9bb]/50 p-6 rounded-2xl shadow-sm flex flex-col justify-between" id="section-recent-actions">
          <div>
            <h4 className="font-semibold text-[#1a1c1c] text-lg mb-5">Últimos Registros</h4>
            
            {recentActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <span className="p-3 bg-[#f3f3f3] text-[#717a6d] rounded-full">
                  <Sparkles className="w-6 h-6" />
                </span>
                <p className="text-sm text-[#717a6d] font-medium">No hay registros de trabajo cargados.</p>
                {userRole !== 'visor' && (
                  <button 
                    onClick={() => onNavigate('add')}
                    className="mt-2 text-xs text-[#006e1c] font-bold hover:underline"
                  >
                    Registrar primer parte diario
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {recentActions.map((e, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-[#eeeeee] flex items-center justify-center text-[#00450d] font-bold text-xs border border-[#c0c9bb]/40 shadow-sm">
                        {getWorkerInitials(e.worker_id)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-[#006e1c] rounded-full border border-white flex items-center justify-center">
                        <span className="block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      </div>
                    </div>
                    <div className="flex-1 border-b border-[#c0c9bb]/20 pb-3">
                      <div className="flex justify-between items-baseline">
                        <p className="text-xs font-bold text-[#1a1c1c]">
                          {getWorkerName(e.worker_id)}
                        </p>
                        <span className="text-[10px] text-[#717a6d] bg-[#f3f3f3] px-1.5 py-0.5 rounded font-mono">
                          {e.date}
                        </span>
                      </div>
                      <p className="text-xs text-[#717a6d] mt-0.5">
                        {e.activity} ({e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)}{['Trabajos al tanto', 'Injertación'].includes(e.type) ? 'u' : (['Parte de Enfermo', 'Licencia', 'Vacaciones'].includes(e.type) ? 'd' : 'h')}) en <span className="font-medium text-[#1a1c1c]">{e.location}</span>
                      </p>
                      <span className="text-[10px] font-bold text-[#0c7521] mt-1 inline-block">
                        {e.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={() => onNavigate('entries')}
            className="w-full mt-6 py-2.5 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-[#00450d] font-bold text-xs rounded-xl transition-all border border-[#c0c9bb]/30 flex items-center justify-center gap-1.5"
          >
            Ver todo el historial de partes
          </button>
        </section>
      </div>

      {/* Static Informational Banner / Alerts — oculto para el encargado
          (es actividad administrativa: liquidaciones) */}
      {userRole !== 'encargado' && (
      <section className="bg-[#1b5e20] text-white p-6 rounded-2xl shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Subtle decorative circles */}
        <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute right-20 -top-10 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
        
        <div className="flex gap-4 items-start md:items-center relative z-10">
          <span className="p-3 bg-white/10 rounded-xl text-[#acf4a4]">
            <Sparkles className="w-6 h-6 animate-spin-slow" />
          </span>
          <div>
            <h4 className="font-bold text-lg">Semana Laboral de Viernes a Jueves</h4>
            <p className="text-xs text-white/80 max-w-xl mt-0.5">
              El sistema liquida acumulando automáticamente la labor de viernes a jueves. Los reportes y liquidas están sincronizados de manera automática.
            </p>
          </div>
        </div>
        <button 
          onClick={() => onNavigate('payroll')}
          className="bg-[#acf4a4] hover:bg-[#91d78a] text-[#002203] font-bold text-xs py-2.5 px-5 rounded-xl transition-all self-stretch md:self-auto flex items-center justify-center gap-1.5 shadow-md active:scale-95"
        >
          Proceder a Liquidaciones <CheckCircle2 className="w-4 h-4" />
        </button>
      </section>
      )}
    </div>
  );
}
