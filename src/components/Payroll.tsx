import React, { useState, useMemo } from 'react';
import { Entry, Worker, MasterCatalogs } from '../types';
import { FileText, Download, Calendar, DollarSign, Users, AlertCircle, Search, Filter, Lock, RefreshCw, X, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface PayrollProps {
  entries: Entry[];
  workers: Worker[];
  catalogs: MasterCatalogs;
  periodoMode?: 'semanal' | 'quincenal';
  onLockEntries?: (ids: string[]) => void;
  onUpdateMultipleEntries?: (updates: {id: string, changes: Partial<Entry>}[]) => void;
  onAddEntries?: (newEntries: Entry[]) => void;
}

type TabType = 'weekly' | 'biweekly' | 'monthly';

export default function Payroll({ entries, workers, catalogs, periodoMode = 'semanal', onLockEntries, onUpdateMultipleEntries, onAddEntries }: PayrollProps) {
  const [activeTab, setActiveTab] = useState<TabType>('weekly');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [periodClosed, setPeriodClosed] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showOnlyPending, setShowOnlyPending] = useState(true);

  const [showMonthlyReportModal, setShowMonthlyReportModal] = useState(false);
  const [selectedMonthReport, setSelectedMonthReport] = useState('');

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    entries.forEach(e => {
      if (e.deleted) return;
      const [year, month] = e.date.split('-');
      months.add(`${year}-${month}`);
    });
    return Array.from(months).sort().reverse();
  }, [entries]);

  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonthReport) {
      setSelectedMonthReport(availableMonths[0]);
    }
  }, [availableMonths, selectedMonthReport]);

  const categoryOptions = useMemo(() => {
    const list = new Set(workers.map(w => w.category));
    return ['Todas', ...Array.from(list)];
  }, [workers]);

  const activeWorkers = useMemo(() => {
    return workers.filter(w => {
      if (!w.isActive) return false;
      if (filterCategory !== 'Todas' && w.category !== filterCategory) return false;
      if (searchTerm && !w.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      
      // Auto-filter by Regime based on Active Tab
      if (activeTab === 'weekly' && w.regime !== 'temporal') return false;
      if (activeTab !== 'weekly' && w.regime === 'temporal') return false;
      
      return true;
    });
  }, [workers, filterCategory, searchTerm, activeTab]);

  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    entries.forEach(e => {
      if (e.deleted) return;
      const w = workers.find(wk => wk.id === e.worker_id);
      if (!w) return;
      
      const [year, month, day] = e.date.split('-');
      const dNum = Number(day);
      
      if (activeTab === 'weekly') {
        if (w.regime === 'temporal') {
          if (periodoMode === 'quincenal') {
            periods.add(`${year}-${month} Quincena ${dNum <= 15 ? '1' : '2'}`);
          } else {
            const d = new Date(`${e.date}T00:00:00`);
            const dayOfWeek = d.getDay();
            const subDays = dayOfWeek === 5 ? 0 : dayOfWeek === 6 ? 1 : dayOfWeek + 2;
            const friday = new Date(d);
            friday.setDate(d.getDate() - subDays);
            const friStr = friday.toISOString().split('T')[0];
            const thurs = new Date(friday);
            thurs.setDate(friday.getDate() + 6);
            const thuStr = thurs.toISOString().split('T')[0];
            periods.add(`${friStr} a ${thuStr}`);
          }
        }
      } else if (activeTab === 'biweekly') {
        if (w.regime !== 'temporal' && dNum <= 15) {
          periods.add(`${year}-${month} Quincena 1`);
        }
      } else {
        if (w.regime !== 'temporal') {
          periods.add(`${year}-${month}`);
        }
      }
    });
    return Array.from(periods).sort().reverse();
  }, [entries, workers, activeTab, periodoMode]);

  React.useEffect(() => {
    if (availablePeriods.length > 0) {
      if (!availablePeriods.includes(selectedPeriod)) {
        setSelectedPeriod(availablePeriods[0]);
      }
    } else {
      setSelectedPeriod('');
    }
  }, [availablePeriods, selectedPeriod]);

  const selectedPeriodRange = useMemo(() => {
    if (activeTab === 'weekly' && periodoMode !== 'quincenal') {
      return { startStr: customStartDate, endStr: customEndDate };
    }
    
    if (!selectedPeriod) return null;
    
    if (activeTab === 'weekly') {
      if (periodoMode === 'quincenal') {
        const [yearMonth, , q] = selectedPeriod.split(' ');
        const [y, m] = yearMonth.split('-');
        if (q === '1') return { startStr: `${y}-${m}-01`, endStr: `${y}-${m}-15` };
        const lastDay = new Date(Number(y), Number(m), 0).getDate().toString().padStart(2, '0');
        return { startStr: `${y}-${m}-16`, endStr: `${y}-${m}-${lastDay}` };
      } else {
        const [start, , end] = selectedPeriod.split(' ');
        return { startStr: start, endStr: end };
      }
    } else if (activeTab === 'biweekly') {
      const [yearMonth] = selectedPeriod.split(' ');
      const [y, m] = yearMonth.split('-');
      return { startStr: `${y}-${m}-01`, endStr: `${y}-${m}-15` };
    } else {
      const [y, m] = selectedPeriod.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate().toString().padStart(2, '0');
      return { startStr: `${y}-${m}-01`, endStr: `${y}-${m}-${lastDay}` };
    }
  }, [selectedPeriod, activeTab, periodoMode]);

  const hasPendingBeforeStart = useMemo(() => {
    if (activeTab !== 'weekly' || periodoMode === 'quincenal') return false;
    return entries.some(e => 
      !e.deleted && 
      !e.locked && 
      e.date < customStartDate && 
      workers.find(w => w.id === e.worker_id && w.regime === 'temporal')
    );
  }, [entries, workers, activeTab, periodoMode, customStartDate]);

  const payrollRows = useMemo(() => {
    return activeWorkers.map(worker => {
      let hours = 0, bruto = 0, adelantoEfectivo = 0, adelantoTransferencia = 0, descuentos = 0;
      let state: 'paid' | 'pending' | 'warning' = 'pending';
      const workerEntries = entries.filter(e => e.worker_id === worker.id && !e.deleted);
      
      const defaultWorkerInfo = { id: worker.id, name: worker.name, category: worker.category, regime: worker.regime, hours, bruto, adelantoEfectivo, adelantoTransferencia, descuentos, neto: 0, state };

      if (!selectedPeriodRange) return defaultWorkerInfo;
      const { startStr, endStr } = selectedPeriodRange;

      if (activeTab === 'weekly') {
        let wE = workerEntries.filter(e => e.date >= startStr && e.date <= endStr);
        if (showOnlyPending && periodoMode !== 'quincenal') {
          wE = wE.filter(e => !e.locked);
        }
        hours = wE.reduce((s, e) => s + (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)), 0);
        if (worker.regime === 'temporal') {
          bruto = wE.reduce((s, e) => ['Adelanto', 'Descuento'].includes(e.type) ? s : s + (e.amount || 0), 0);
          adelantoEfectivo = wE.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'efectivo').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          adelantoTransferencia = wE.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'transferencia').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          descuentos = wE.filter(e => e.type === 'Descuento').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          state = (hours > 0 || bruto > 0 || adelantoEfectivo > 0 || adelantoTransferencia > 0 || descuentos > 0) ? 'paid' : 'pending';
        }
      } else if (activeTab === 'biweekly') {
        const bE = workerEntries.filter(e => e.date >= startStr && e.date <= endStr && Number(e.date.split('-')[2]) <= 15);
        hours = bE.reduce((s, e) => s + (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)), 0);
        if (worker.regime === 'mensualizado') {
          bruto = (worker.fixedSalary || 85000) / 2;
          descuentos = bE.filter(e => e.type === 'Descuento').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          state = 'paid';
        } else if (worker.regime === 'permanente') {
          bruto = bE.reduce((s, e) => ['Adelanto', 'Descuento'].includes(e.type) ? s : s + (e.amount || 0), 0);
          descuentos = bE.filter(e => e.type === 'Descuento').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          state = (hours > 0 || bruto > 0) ? 'paid' : 'pending';
        }
        const explicitAdvances = bE.filter(e => e.type === 'Adelanto');
        adelantoEfectivo = explicitAdvances.filter(e => e.paymentMethod?.toLowerCase() === 'efectivo').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
        adelantoTransferencia = explicitAdvances.filter(e => e.paymentMethod?.toLowerCase() === 'transferencia').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
        state = (hours > 0 || bruto > 0 || adelantoEfectivo > 0 || adelantoTransferencia > 0) ? 'paid' : 'pending';
      } else {
        const mE = workerEntries.filter(e => e.date >= startStr && e.date <= endStr);
        hours = mE.reduce((s, e) => s + (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)), 0);
        if (worker.regime === 'mensualizado') {
          const base = worker.fixedSalary || 85000;
          const vacationValue = mE.filter(e => e.type === 'Vacaciones').reduce((s, e) => {
            const val = e.amount || ((e.quantity || e.hours || 0) * (e.rate || 0));
            return s + val;
          }, 0);
          bruto = (base / 2) + vacationValue;
          adelantoEfectivo = mE.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'efectivo').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          adelantoTransferencia = mE.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'transferencia').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          if (adelantoEfectivo === 0 && adelantoTransferencia === 0) adelantoTransferencia = Math.round(base / 2);
          descuentos = mE.filter(e => e.type === 'Descuento').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          state = 'paid';
        } else {
          bruto = mE.reduce((s, e) => ['Adelanto', 'Descuento'].includes(e.type) ? s : s + (e.amount || 0), 0);
          adelantoEfectivo = mE.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'efectivo').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          adelantoTransferencia = mE.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'transferencia').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          descuentos = mE.filter(e => e.type === 'Descuento').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
          state = (hours > 0 || bruto > 0 || adelantoEfectivo > 0 || adelantoTransferencia > 0 || descuentos > 0) ? 'paid' : 'pending';
        }
      }
      
      const neto = Math.max(bruto - adelantoEfectivo - adelantoTransferencia - descuentos, 0);
      if (hours > 0 && bruto === 0 && worker.regime === 'temporal' && activeTab === 'weekly') state = 'warning';
      return { id: worker.id, name: worker.name, category: worker.category, regime: worker.regime, hours, bruto, adelantoEfectivo, adelantoTransferencia, descuentos, neto, state };
    }).filter(row => {
      if (row.state === 'pending') return false;
      if (filterPaymentMethod === 'Efectivo' && row.adelantoEfectivo === 0) return false;
      if (filterPaymentMethod === 'Transferencia' && row.adelantoTransferencia === 0) return false;
      return true;
    });
  }, [activeWorkers, entries, activeTab, selectedPeriodRange, filterPaymentMethod]);

  const summaryMetrics = useMemo(() => ({
    totalNet: payrollRows.reduce((s, r) => s + r.neto, 0),
    totalDiscounts: payrollRows.reduce((s, r) => s + r.descuentos, 0),
    activeCount: activeWorkers.length
  }), [payrollRows, activeWorkers]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
  };

  const handleExport = () => {
    if (!selectedPeriod && !(activeTab === 'weekly' && periodoMode !== 'quincenal')) {
      alert("No hay período seleccionado para exportar.");
      return;
    }
    
    let periodName = selectedPeriod;
    if (activeTab === 'weekly' && periodoMode !== 'quincenal') {
      periodName = `${customStartDate}_al_${customEndDate}`;
    }
    const filename = `Bobadilla_Liq_${periodName.replace(/ /g, '_')}`;

    const sumRows = payrollRows.map((r, i) => ({
      '#': i + 1,
      'Nombre': r.name,
      'Categoria': r.category,
      'Regimen': r.regime,
      'Horas': r.hours || '',
      'Bruto': r.bruto,
      'Adel Efectivo': r.adelantoEfectivo ? -r.adelantoEfectivo : '',
      'Adel Transferencia': r.adelantoTransferencia ? -r.adelantoTransferencia : '',
      'Total Adelantos': -(r.adelantoEfectivo + r.adelantoTransferencia),
      'Descuentos': r.descuentos ? -r.descuentos : '',
      'Neto': r.neto
    }));

    const totBruto = sumRows.reduce((s, r) => s + (Number(r['Bruto']) || 0), 0);
    const totAdelEf = sumRows.reduce((s, r) => s + (Number(r['Adel Efectivo']) || 0), 0);
    const totAdelTr = sumRows.reduce((s, r) => s + (Number(r['Adel Transferencia']) || 0), 0);
    const totAdelanto = sumRows.reduce((s, r) => s + (Number(r['Total Adelantos']) || 0), 0);
    const totDesc = sumRows.reduce((s, r) => s + (Number(r['Descuentos']) || 0), 0);
    const totNeto = sumRows.reduce((s, r) => s + (Number(r['Neto']) || 0), 0);
    const totHs = sumRows.reduce((s, r) => s + (Number(r['Horas']) || 0), 0);

    sumRows.push({
      '#': '' as any,
      'Nombre': 'TOTAL',
      'Categoria': '',
      'Regimen': '',
      'Horas': totHs || '',
      'Bruto': totBruto,
      'Adel Efectivo': totAdelEf,
      'Adel Transferencia': totAdelTr,
      'Total Adelantos': totAdelanto,
      'Descuentos': totDesc,
      'Neto': totNeto
    });

    let validWorkerIds = payrollRows.map(r => r.id);
    let detailedEntries = entries.filter(e => !e.deleted && validWorkerIds.includes(e.worker_id));
    
    if (selectedPeriodRange) {
      const { startStr, endStr } = selectedPeriodRange;
      if (activeTab === 'biweekly') {
        detailedEntries = detailedEntries.filter(e => e.date >= startStr && e.date <= endStr && Number(e.date.split('-')[2]) <= 15);
      } else {
        detailedEntries = detailedEntries.filter(e => e.date >= startStr && e.date <= endStr);
      }
    }

    const detRows = detailedEntries.sort((a, b) => a.date.localeCompare(b.date)).map(e => {
      const workerInfo = workers.find(w => w.id === e.worker_id);
      const [year, month, day] = e.date.split('-');
      return {
        'Fecha': e.date,
        'Dia': day,
        'Mes': month,
        'Ano': year,
        'Periodo': periodName,
        'Tipo': e.type,
        'Nombre': workerInfo?.name || '',
        'Categoria': workerInfo?.category || '',
        'Lugar': e.location || '',
        'Cuadro': e.quadro || '',
        'Especie': e.specie || '',
        'Actividad': e.activity || '',
        'Trabajo': e.subtask || '',
        'Descripcion': e.notes || '',
        'Cantidad': e.quantity || e.hours || 0,
        'Precio Unitario': e.rate || 0,
        'Total': e.amount || 0,
        'Forma de Pago': e.paymentMethod || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sumRows);
    ws1['!cols'] = [{wch:4},{wch:28},{wch:18},{wch:14},{wch:8},{wch:14},{wch:14},{wch:16},{wch:14},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Liquidacion');
    
    if (detRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(detRows);
      ws2['!cols'] = [{wch:12},{wch:6},{wch:4},{wch:5},{wch:25},{wch:16},{wch:25},{wch:18},{wch:12},{wch:7},{wch:16},{wch:22},{wch:22},{wch:35},{wch:9},{wch:14},{wch:14},{wch:16}];
      XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');
    }

    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const handleClosePeriod = () => {
    if (!selectedPeriod && !(activeTab === 'weekly' && periodoMode !== 'quincenal')) {
      alert("No hay período seleccionado para cerrar.");
      return;
    }

    const closedPeriodName = activeTab === 'weekly' && periodoMode !== 'quincenal' 
      ? `${customStartDate} a ${customEndDate}` 
      : selectedPeriod;

    let validWorkerIds = payrollRows.map(r => r.id);
    let detailedEntries = entries.filter(e => !e.deleted && validWorkerIds.includes(e.worker_id));
    
    if (selectedPeriodRange) {
      const { startStr, endStr } = selectedPeriodRange;
      if (activeTab === 'biweekly') {
        detailedEntries = detailedEntries.filter(e => e.date >= startStr && e.date <= endStr && Number(e.date.split('-')[2]) <= 15);
      } else {
        detailedEntries = detailedEntries.filter(e => e.date >= startStr && e.date <= endStr);
      }
    }

    const entriesToLock = detailedEntries.filter(e => !e.locked);

    if (entriesToLock.length === 0) {
      alert("Todos los registros de este período ya se encuentran cerrados.");
      return;
    }

    if (confirm(`¿Está seguro de que desea CERRAR el período actual?\nEsto bloqueará definitivamente ${entriesToLock.length} partes de trabajo y no podrán volver a editarse ni borrarse.`)) {
      setPeriodClosed(true);
      if (onLockEntries) {
        onLockEntries(entriesToLock.map(e => e.id));
      }

      // Create carry-over entries for negative net balances
      if (onAddEntries && selectedPeriodRange) {
        const nextDay = new Date(selectedPeriodRange.endStr + 'T00:00:00');
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        
        const carryOverEntries: Entry[] = payrollRows
          .filter(r => (r.bruto - r.adelantoEfectivo - r.adelantoTransferencia - r.descuentos) < 0)
          .map(r => {
            const diff = Math.abs(r.bruto - r.adelantoEfectivo - r.adelantoTransferencia - r.descuentos);
            return {
              id: crypto.randomUUID(),
              worker_id: r.id,
              date: nextDayStr,
              type: 'Adelanto',
              location: 'Administración',
              quadro: '',
              specie: '',
              activity: 'Ajuste de Saldo',
              subtask: 'Arrastre período anterior',
              hours: 0,
              quantity: 0,
              amount: diff,
              rate: diff,
              paymentMethod: 'Transferencia',
              notes: `Saldo a favor de la empresa arrastrado del período cerrado (${closedPeriodName}).`,
              updated_at: new Date().toISOString()
            };
          });

        if (carryOverEntries.length > 0) {
          onAddEntries(carryOverEntries);
        }
      }

      setTimeout(() => {
        alert('Período cerrado y registros bloqueados correctamente. Se generaron adelantos si hubieron saldos negativos.');
        setPeriodClosed(false);
      }, 800);
    }
  };

  const handleRecalculate = () => {
    if (!selectedPeriod && !(activeTab === 'weekly' && periodoMode !== 'quincenal')) {
      alert("No hay período seleccionado para recalcular.");
      return;
    }

    let validWorkerIds = payrollRows.map(r => r.id);
    let detailedEntries = entries.filter(e => !e.deleted && !e.locked && validWorkerIds.includes(e.worker_id));
    
    if (selectedPeriodRange) {
      const { startStr, endStr } = selectedPeriodRange;
      if (activeTab === 'biweekly') {
        detailedEntries = detailedEntries.filter(e => e.date >= startStr && e.date <= endStr && Number(e.date.split('-')[2]) <= 15);
      } else {
        detailedEntries = detailedEntries.filter(e => e.date >= startStr && e.date <= endStr);
      }
    }

    const workEntries = detailedEntries.filter(e => !['Adelanto', 'Descuento', 'Bonificación', 'Vacaciones', 'Feriado', 'Licencia'].includes(e.type));
    if (workEntries.length === 0) {
      alert("No hay registros de trabajo habilitados para recalcular en este período.");
      return;
    }

    const updates: {id: string, changes: Partial<Entry>}[] = [];
    workEntries.forEach(e => {
      const workerInfo = workers.find(w => w.id === e.worker_id);
      if (!workerInfo) return;
      
      const categoryObj = catalogs.categories.find(c => c.name === workerInfo.category);
      const categoryRate = categoryObj?.defaultRate || 4000;

      if (e.rate !== categoryRate) {
        updates.push({
          id: e.id,
          changes: {
            rate: categoryRate,
            amount: (e.quantity || e.hours || 0) * categoryRate
          }
        });
      }
    });

    if (updates.length === 0) {
      alert("Todos los precios unitarios ya están sincronizados con las tarifas vigentes actuales de las categorías.");
      return;
    }

    if (confirm(`Se actualizarán ${updates.length} registros con las tarifas actuales configuradas en General.\n\nEsta acción modificará los montos de la liquidación actual. ¿Desea continuar?`)) {
      if (onUpdateMultipleEntries) {
        onUpdateMultipleEntries(updates);
        alert(`Recálculo exitoso: ${updates.length} partes actualizados.`);
      }
    }
  };

  const handleExportMonthlyTemporaries = () => {
    if (!selectedMonthReport) {
      alert("No hay mes seleccionado.");
      return;
    }
    
    const tempWorkers = workers.filter(w => w.isActive && w.regime === 'temporal');
    const [y, m] = selectedMonthReport.split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate().toString().padStart(2, '0');
    const startStr = `${y}-${m}-01`;
    const endStr = `${y}-${m}-${lastDay}`;

    const monthEntries = entries.filter(e => !e.deleted && e.date >= startStr && e.date <= endStr);
    
    const sumRows = tempWorkers.map((worker, i) => {
        const workerEntries = monthEntries.filter(e => e.worker_id === worker.id);
        const hours = workerEntries.reduce((s, e) => s + (e.hours > 0 ? e.hours : (e.quantity > 0 ? e.quantity : 0)), 0);
        const bruto = workerEntries.reduce((s, e) => ['Adelanto', 'Descuento'].includes(e.type) ? s : s + (e.amount || 0), 0);
        const adelantoEfectivo = workerEntries.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'efectivo').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
        const adelantoTransferencia = workerEntries.filter(e => e.type === 'Adelanto' && e.paymentMethod?.toLowerCase() === 'transferencia').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
        const descuentos = workerEntries.filter(e => e.type === 'Descuento').reduce((s, e) => s + Math.abs(e.amount || 0), 0);
        const neto = Math.max(bruto - adelantoEfectivo - adelantoTransferencia - descuentos, 0);
        
        return {
          '#': i + 1,
          'Nombre': worker.name,
          'Categoria': worker.category,
          'Horas': hours || '',
          'Bruto': bruto,
          'Adel Efectivo': adelantoEfectivo ? -adelantoEfectivo : '',
          'Adel Transferencia': adelantoTransferencia ? -adelantoTransferencia : '',
          'Descuentos': descuentos ? -descuentos : '',
          'Neto': neto
        };
    }).filter(r => r.Bruto > 0 || r['Adel Efectivo'] !== '' || r['Adel Transferencia'] !== '' || r.Descuentos !== '');

    const totBruto = sumRows.reduce((s, r) => s + (Number(r['Bruto']) || 0), 0);
    const totAdelEf = sumRows.reduce((s, r) => s + (Number(r['Adel Efectivo']) || 0), 0);
    const totAdelTr = sumRows.reduce((s, r) => s + (Number(r['Adel Transferencia']) || 0), 0);
    const totDesc = sumRows.reduce((s, r) => s + (Number(r['Descuentos']) || 0), 0);
    const totNeto = sumRows.reduce((s, r) => s + (Number(r['Neto']) || 0), 0);
    const totHs = sumRows.reduce((s, r) => s + (Number(r['Horas']) || 0), 0);

    sumRows.push({
      '#': '' as any,
      'Nombre': 'TOTAL',
      'Categoria': '',
      'Horas': totHs || '',
      'Bruto': totBruto,
      'Adel Efectivo': totAdelEf,
      'Adel Transferencia': totAdelTr,
      'Descuentos': totDesc,
      'Neto': totNeto
    });

    let validWorkerIds = tempWorkers.map(r => r.id);
    let detailedEntries = monthEntries.filter(e => validWorkerIds.includes(e.worker_id));
    
    const detRows = detailedEntries.sort((a, b) => a.date.localeCompare(b.date)).map(e => {
      const workerInfo = workers.find(w => w.id === e.worker_id);
      const [year, month, day] = e.date.split('-');
      return {
        'Fecha': e.date,
        'Dia': day,
        'Semana': Math.ceil(Number(day)/7),
        'Tipo': e.type,
        'Nombre': workerInfo?.name || '',
        'Categoria': workerInfo?.category || '',
        'Lugar': e.location || '',
        'Cuadro': e.quadro || '',
        'Especie': e.specie || '',
        'Actividad': e.activity || '',
        'Trabajo': e.subtask || '',
        'Descripcion': e.notes || '',
        'Cantidad': e.quantity || e.hours || 0,
        'Precio Unitario': e.rate || 0,
        'Total': e.amount || 0,
        'Forma de Pago': e.paymentMethod || ''
      };
    });

    const filename = `Reporte_Temporarios_${selectedMonthReport}`;
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sumRows);
    ws1['!cols'] = [{wch:4},{wch:28},{wch:18},{wch:8},{wch:14},{wch:14},{wch:16},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen_Mensual');
    
    if (detRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(detRows);
      ws2['!cols'] = [{wch:12},{wch:6},{wch:8},{wch:20},{wch:25},{wch:16},{wch:18},{wch:12},{wch:16},{wch:22},{wch:22},{wch:35},{wch:9},{wch:14},{wch:14},{wch:16}];
      XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');
    }

    XLSX.writeFile(wb, `${filename}.xlsx`);
    setShowMonthlyReportModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-[#c0c9bb]/50 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-[#00450d] to-[#006e1c] bg-clip-text text-transparent">Liquidación de Haberes</h2>
        </div>
        <div className="flex gap-2.5 flex-wrap justify-end">
          <button onClick={() => setShowMonthlyReportModal(true)} className="flex py-2.5 px-4 rounded-xl border border-[#00450d] text-[#00450d] bg-[#98f994]/20 text-xs font-bold items-center gap-1.5 hover:bg-[#98f994]/40 transition-colors"><FileSpreadsheet className="w-4 h-4" /> Reporte Temporarios</button>
          <button onClick={handleRecalculate} className="flex py-2.5 px-4 rounded-xl border border-[#c0c9bb] text-xs font-bold items-center gap-1.5 hover:bg-[#f9f9f9]"><RefreshCw className="w-4 h-4" /> Recalcular</button>
          <button onClick={handleExport} className="flex py-2.5 px-4 rounded-xl border border-[#c0c9bb] text-xs font-bold items-center gap-1.5 hover:bg-[#f9f9f9]"><Download className="w-4 h-4" /> Exportar</button>
          <button onClick={handleClosePeriod} className="flex py-2.5 px-4 rounded-xl bg-[#00450d] text-white text-xs font-bold items-center gap-1.5 hover:bg-[#002203]"><Lock className="w-4 h-4" /> Cerrar Periodo</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#f3f3f3]/60 border border-[#c0c9bb]/60 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-[#717a6d] uppercase">Total Neto a Pagar</span>
          <div className="text-2xl font-bold text-[#00450d] mt-2">{formatCurrency(summaryMetrics.totalNet)}</div>
        </div>
        <div className="bg-[#f3f3f3]/60 border border-[#c0c9bb]/60 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-[#717a6d] uppercase">Personal Incluido</span>
          <div className="text-2xl font-bold text-[#1a1c1c] mt-2">{summaryMetrics.activeCount}</div>
        </div>
        <div className="bg-[#f3f3f3]/60 border border-[#c0c9bb]/60 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] font-bold text-[#717a6d] uppercase">Deducciones (Descuentos)</span>
          <div className="text-2xl font-bold text-[#ba1a1a] mt-2">-{formatCurrency(summaryMetrics.totalDiscounts)}</div>
        </div>
      </div>

      <div className="bg-white border border-[#c0c9bb]/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex border-b border-[#c0c9bb]/25 bg-[#f3f3f3]/60">
          {(['weekly', 'biweekly', 'monthly'] as TabType[]).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-4 text-xs font-bold border-b-2 transition-colors ${activeTab === t ? 'text-[#00450d] bg-white border-[#00450d]' : 'border-transparent text-[#717a6d] hover:bg-white/50'}`}>
              {t === 'weekly' ? (periodoMode === 'quincenal' ? 'Quincenal (Temporales)' : 'Semanal (Temporales)') : t === 'biweekly' ? 'Adelanto Quincenal' : 'Liquidación Mensual'}
            </button>
          ))}
        </div>
        <div className="p-4 bg-[#f9f9f9] border-b border-[#c0c9bb]/20 flex flex-wrap items-center gap-3">
          
          {/* Period Selector */}
          <div className="flex items-center gap-2 mr-auto">
            {activeTab === 'weekly' && periodoMode !== 'quincenal' ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#717a6d]">Desde:</span>
                  <input 
                    type="date" 
                    value={customStartDate} 
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="h-9 px-3 text-xs border border-[#c0c9bb] rounded-lg outline-none font-bold text-[#1a1c1c] bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#717a6d]">Hasta:</span>
                  <input 
                    type="date" 
                    value={customEndDate} 
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="h-9 px-3 text-xs border border-[#c0c9bb] rounded-lg outline-none font-bold text-[#1a1c1c] bg-white"
                  />
                </div>
                <label className="flex items-center gap-2 ml-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-[#c0c9bb] hover:bg-[#f9f9f9]">
                  <input 
                    type="checkbox" 
                    checked={showOnlyPending}
                    onChange={e => setShowOnlyPending(e.target.checked)}
                    className="w-4 h-4 rounded text-[#00450d] focus:ring-[#00450d]"
                  />
                  <span className="text-xs font-bold text-[#00450d]">Ocultar ya liquidados</span>
                </label>
              </div>
            ) : (
              <>
                <span className="text-xs font-bold text-[#717a6d]">Período:</span>
                <select 
                  value={selectedPeriod} 
                  onChange={e => setSelectedPeriod(e.target.value)}
                  className="h-9 px-3 text-xs border border-[#c0c9bb] rounded-lg outline-none font-bold text-[#1a1c1c] bg-white min-w-[200px]"
                >
                  {availablePeriods.length === 0 ? (
                    <option value="">Sin registros</option>
                  ) : (
                    availablePeriods.map(p => <option key={p} value={p}>{p}</option>)
                  )}
                </select>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#717a6d]" />
              <input type="text" placeholder="Buscar trabajador..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9 pl-9 pr-3 text-xs border border-[#c0c9bb] rounded-lg w-48" />
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-lg">
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterPaymentMethod} onChange={e => setFilterPaymentMethod(e.target.value)} className="h-9 px-2 text-xs border border-[#c0c9bb] rounded-lg">
              <option value="Todos">Todos (F. Pago)</option>
              <option value="Efectivo">Adelanto Efectivo</option>
              <option value="Transferencia">Adelanto Transferencia</option>
            </select>
          </div>

        </div>

        {hasPendingBeforeStart && (
          <div className="px-4 py-3 bg-[#fff4e5] border-b border-[#ffdca8] flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#f57c00] shrink-0 mt-0.5" />
            <div className="text-xs text-[#b25600]">
              <span className="font-bold block mb-0.5">Atención: Hay registros pendientes anteriores a la fecha "Desde".</span>
              Existen partes de trabajo de personal temporal sin liquidar con fecha anterior al {customStartDate}. Si no deseas dejarlos colgados, puedes ampliar la fecha de inicio.
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f3f3f3] text-[10px] uppercase text-[#717a6d] border-b border-[#c0c9bb]/50 tracking-wider">
                <th className="p-3 font-bold">Personal</th>
                <th className="p-3 font-bold hidden md:table-cell">Regimen</th>
                <th className="p-3 font-bold text-center">Horas</th>
                <th className="p-3 font-bold text-right">Bruto</th>
                <th className="p-3 font-bold text-right">Adel. Efectivo</th>
                <th className="p-3 font-bold text-right">Adel. Transf.</th>
                <th className="p-3 font-bold text-right">Descuentos</th>
                <th className="p-3 font-bold text-right text-[#00450d]">Neto</th>
                <th className="p-3 font-bold text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {payrollRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-xs text-[#717a6d]">
                    No hay información registrada para liquidar en el período seleccionado.
                  </td>
                </tr>
              ) : payrollRows.map((row) => (
                <tr key={row.id} className="border-b border-[#c0c9bb]/20 hover:bg-[#f9f9f9]/50 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-xs text-[#1a1c1c]">{row.name}</div>
                    <div className="text-[10px] text-[#717a6d]">{row.category}</div>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <span className="text-[10px] font-bold bg-[#f3f3f3] text-[#717a6d] px-2 py-0.5 rounded uppercase">
                      {row.regime}
                    </span>
                  </td>
                  <td className="p-3 text-center text-xs font-semibold text-[#1a1c1c]">
                    {row.hours > 0 ? row.hours : '-'}
                  </td>
                  <td className="p-3 text-right text-xs font-semibold text-[#1a1c1c]">
                    {formatCurrency(row.bruto)}
                  </td>
                  <td className="p-3 text-right text-xs font-medium text-[#ba1a1a]">
                    {row.adelantoEfectivo > 0 ? `-${formatCurrency(row.adelantoEfectivo)}` : '-'}
                  </td>
                  <td className="p-3 text-right text-xs font-medium text-[#ba1a1a]">
                    {row.adelantoTransferencia > 0 ? `-${formatCurrency(row.adelantoTransferencia)}` : '-'}
                  </td>
                  <td className="p-3 text-right text-xs font-medium text-[#ba1a1a]">
                    {row.descuentos > 0 ? `-${formatCurrency(row.descuentos)}` : '-'}
                  </td>
                  <td className="p-3 text-right text-sm font-bold text-[#00450d]">
                    {formatCurrency(row.neto)}
                  </td>
                  <td className="p-3 text-center">
                    {row.state === 'paid' && (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#006e1c] shadow-[0_0_8px_#006e1c]" title="Calculado y Listo"></span>
                    )}
                    {row.state === 'pending' && (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#c0c9bb]" title="Sin registros para liquidar"></span>
                    )}
                    {row.state === 'warning' && (
                      <AlertCircle className="w-4 h-4 text-[#ba1a1a] mx-auto" title="Revisar: Horas trabajadas pero Bruto 0" />
                    )}
                  </td>
                </tr>
              ))}
              {payrollRows.length > 0 && (
                <tr className="bg-[#f3f3f3] font-bold text-xs border-t-2 border-[#c0c9bb]/50">
                  <td className="p-3 text-[#1a1c1c]" colSpan={2}>TOTALES</td>
                  <td className="p-3 text-center text-[#1a1c1c]">
                    {payrollRows.reduce((s, r) => s + r.hours, 0)}
                  </td>
                  <td className="p-3 text-right text-[#1a1c1c]">
                    {formatCurrency(payrollRows.reduce((s, r) => s + r.bruto, 0))}
                  </td>
                  <td className="p-3 text-right text-[#ba1a1a]">
                    -{formatCurrency(payrollRows.reduce((s, r) => s + r.adelantoEfectivo, 0))}
                  </td>
                  <td className="p-3 text-right text-[#ba1a1a]">
                    -{formatCurrency(payrollRows.reduce((s, r) => s + r.adelantoTransferencia, 0))}
                  </td>
                  <td className="p-3 text-right text-[#ba1a1a]">
                    -{formatCurrency(payrollRows.reduce((s, r) => s + r.descuentos, 0))}
                  </td>
                  <td className="p-3 text-right text-[#00450d] text-sm">
                    {formatCurrency(summaryMetrics.totalNet)}
                  </td>
                  <td className="p-3"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showMonthlyReportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-white border border-[#c0c9bb] rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowMonthlyReportModal(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-[#f3f3f3] rounded-full transition-colors text-[#717a6d]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-[#00450d] mb-4 flex items-center gap-1.5">
              <FileSpreadsheet className="w-5 h-5" /> Reporte Mensual Temporarios
            </h3>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#717a6d] uppercase">Mes a Exportar</label>
                <select 
                  value={selectedMonthReport}
                  onChange={e => setSelectedMonthReport(e.target.value)}
                  className="h-10 px-3 text-xs border border-[#c0c9bb] rounded-lg outline-none font-bold text-[#1a1c1c] bg-[#f9f9f9]"
                >
                  {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <p className="text-xs text-[#717a6d]">
                Se descargará un archivo Excel con una pestaña de Resumen Mensual y otra con el Detalle (incluyendo la semana) de todos los trabajadores temporales que tuvieron actividad en el mes seleccionado.
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  onClick={handleExportMonthlyTemporaries}
                  className="flex-1 py-2.5 bg-[#00450d] text-white text-xs font-bold rounded-xl shadow-md hover:bg-[#002203] flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Descargar Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
