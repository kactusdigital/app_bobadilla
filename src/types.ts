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
  type: string; // "Trabajos al día", "Trabajos al tanto", "Injertación", "Adelanto", "Descuento", "Feriado", "Licencia", "Vacaciones", "Bonificación"
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
