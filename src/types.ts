export interface Worker {
  id: string;
  name: string;
  category: string; // 'Peon General' | 'Tractorista' | 'Capataz' | 'Encargado Invernadero' | 'Administración' | any custom
  regime: 'temporal' | 'permanente' | 'mensualizado';
  hourlyRate: number;
  fixedSalary?: number; // For mensualizados (default: e.g. 24000)
  isActive: boolean;
  legajo: string; // Slug eg. "RM #4402"
  dni?: string;
  cuit?: string;
  bankAccount?: string;
}

export interface Entry {
  id: string;
  worker_id: string;
  date: string; // YYYY-MM-DD
  type: string; // "Trabajos al día", "Trabajos al tanto", "Injertación", "Adelanto", "Descuento", "Feriado", "Licencia", "Vacaciones", "Bonificación", "Registro Administración"
  location: string;
  quadro: string;
  specie: string;
  activity: string;
  subtask?: string;
  notes?: string;
  paymentMethod?: string;
  hours: number;
  quantity: number;
  amount: number; // Total amount paid/discounted (can be auto-calculated as rate * hours, or manual bonus amount)
  rate: number; // rate applied at the moment of entry
  deleted?: boolean; // soft delete tracker
  locked?: boolean; // lock tracker for finalized payrolls
  updated_at?: string; // ISO string
  created_by?: string; // ID of the user who created it
  client_uuid?: string; // CAPA 2: clave de idempotencia única generada al crear el parte (evita duplicados/pérdidas por colisión o re-subida)
}

export interface DeletedEntry {
  id: string;
  deleted_at: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface MasterCatalogs {
  locations: string[];
  species: string[];
  activities: Record<string, string[]>;
  categories: { name: string; defaultRate: number; description?: string }[];
  periodoMode?: 'semanal' | 'quincenal';
}

export interface WhatsAppMessage {
  id: string;
  telefono_origen: string;
  payload_extraido: any;
  status: string;
  transcription?: string;
  created_at: string;
}

// Fecha local en formato YYYY-MM-DD. NUNCA usar toISOString() para esto:
// devuelve la fecha en UTC, y en Argentina (UTC-3) a partir de las 21:00
// "salta" al día siguiente (partes rechazados por "fecha futura", Dashboard
// mostrando 0 registros de hoy, etc.).
export const localDateStr = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatCurrency = (value: number): string => {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(absValue);
  
  const clean = formatted
    .replace('ARS', '')
    .replace('AR$', '')
    .replace('$ ', '') // Handles non-breaking spaces if they exist in the formatter output
    .replace('$', '')
    .trim();
  
  return `${isNegative ? '-' : ''}$${clean}`;
};
