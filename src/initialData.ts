import { Worker, MasterCatalogs } from './types';

export const DEFAULT_WORKERS: Worker[] = [
  {
    id: 'w1',
    name: 'Segura Luis Antonio',
    category: 'Capataz',
    regime: 'mensualizado',
    hourlyRate: 5000,
    fixedSalary: 1500000,
    isActive: true,
    legajo: '#1000'
  },
  {
    id: 'w2',
    name: 'Mignaberre Lucas',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1001'
  },
  {
    id: 'w3',
    name: 'Mignaberre Silvestre',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1002'
  },
  {
    id: 'w4',
    name: 'Fuentes Facundo',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1003'
  },
  {
    id: 'w5',
    name: 'Villalba Martin',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1004'
  },
  {
    id: 'w6',
    name: 'Guaquinchay Kevin',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1005'
  },
  {
    id: 'w7',
    name: 'Escobar Facundo',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1006'
  },
  {
    id: 'w8',
    name: 'Lizardez Joana',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1007'
  },
  {
    id: 'w9',
    name: 'Mena Pamela',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1008'
  },
  {
    id: 'w10',
    name: 'Cejas Ailin',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1009'
  },
  {
    id: 'w11',
    name: 'Penaloza Ramon',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1010'
  },
  {
    id: 'w12',
    name: 'Lizardez Lucia',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1011'
  },
  {
    id: 'w13',
    name: 'Alfaro Brisa',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1012'
  },
  {
    id: 'w14',
    name: 'Quiroga Ana',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1013'
  },
  {
    id: 'w15',
    name: 'Lizardez Maira',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1014'
  },
  {
    id: 'w16',
    name: 'Lizardez Ramon',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1015'
  },
  {
    id: 'w17',
    name: 'Martinez Ezequiel',
    category: 'Administracion',
    regime: 'temporal',
    hourlyRate: 4500,
    isActive: true,
    legajo: '#1016'
  },
  {
    id: 'w18',
    name: 'Mendoza Alejandro',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1017'
  },
  {
    id: 'w19',
    name: 'Narvaez Cesar',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1018'
  },
  {
    id: 'w20',
    name: 'Narvaez Jony',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1019'
  },
  {
    id: 'w21',
    name: 'Narvaez Kevin',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1020'
  },
  {
    id: 'w22',
    name: 'Parada Norma',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1021'
  },
  {
    id: 'w23',
    name: 'Paz Alberto',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1022'
  },
  {
    id: 'w24',
    name: 'Ramirez Magui',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1023'
  },
  {
    id: 'w25',
    name: 'Salinas Quimey',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1024'
  },
  {
    id: 'w26',
    name: 'Bordon Brian',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1025'
  },
  {
    id: 'w27',
    name: 'Escudero Lautaro',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1026'
  },
  {
    id: 'w28',
    name: 'Farias Maricel',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1027'
  },
  {
    id: 'w29',
    name: 'Galdame Agustina',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1028'
  },
  {
    id: 'w30',
    name: 'Albornoz Milagros',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1029'
  },
  {
    id: 'w31',
    name: 'Rodriguez Patricia',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1030'
  },
  {
    id: 'w32',
    name: 'Salinas Claudio',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1031'
  },
  {
    id: 'w33',
    name: 'Mercado Juampi',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1032'
  },
  {
    id: 'w34',
    name: 'Mercado Rafael',
    category: 'Peon General',
    regime: 'temporal',
    hourlyRate: 4000,
    isActive: true,
    legajo: '#1033'
  },
  {
    id: 'w35',
    name: 'Paz Federico',
    category: 'Encargado Invernadero',
    regime: 'mensualizado',
    hourlyRate: 4000,
    fixedSalary: 1200000,
    isActive: true,
    legajo: '#1034'
  }
];

export const DEFAULT_CATALOGS: MasterCatalogs = {
  locations: [
    'Finca',
    'CLA',
    'Capacho',
    'CLA/Finca',
    'Parcela Nueva',
    'Galpon'
  ],
  species: [
    'Adara',
    'Gisela',
    'Nogal',
    'Almendra',
    'Nuez',
    'Manzano',
    'Durazno',
    'Ciruelo',
    'Cerezo',
    'Membrillo',
    'Peral',
    'Damasco',
    'LV',
    'GxN',
    'Frambuesas',
    'Adara',
    'Paradox',
    'Adara',
    'durazno',
    'Regia',
    'Porta Injerto'
  ],
  activities: {
  "Preparacion de suelo": ["Subsolado", "Rastreado", "Cincelado/Marcado"],
  "Riego": ["Preparacion de riego", "Limpieza de riego/Limpieza de cupos", "Riegos"],
  "Injertada": ["Extraccion de material", "Limpieza del pie", "Injertada", "Corte de Cinta"],
  "Colocar Tela Antigranizo": ["Armado de estructura", "Poner alambres", "Colocar tela"],
  "Sacado Tela Antigranizo": ["Sacar Tela", "Sacar Alambres", "Sacar palos"],
  "Estaquillado Lenoso": ["Extraccion de material", "Estaquillado"],
  "Estaquillado herbaceo": ["Llenar macetas/bandejas", "Estaquillado"],
  "Desmalezado manual": [],
  "Escardillado": [],
  "Desbrotes": [],
  "Desmalezado con herbicida": ["Con tractor", "Con Mochila"],
  "Curaciones": ["Con tractor", "Con Mochila"],
  "Transplante": ["Plantacion de Estacas", "Plantacion de repique", "Siembra de nuez", "Siembra de carozo"],
  "Encepada": ["Preparacion", "Arrancado"],
  "Almacigos": ["Preparacion", "Arrancado"],
  "Cosecha": ["Cosecha de Nuez", "Cosecha de Carozo", "Cosecha de Uva", "Cosecha de frutas"],
  "Secado de Nuez": ["Lavado/Despelonado", "Vaciado Hornos/Embolsado", "Despacho", "Partido de nuez"],
  "Fertilizacion": [],
  "Arrancada": ["Conteos", "Pintada", "Arrancado", "Seleccion/Clasificacion"],
  "Despacho de plantas": ["Descalzado", "Carga de camion"],
  "Poda de plantas madres": ["Extraccion material vegetal lenoso", "Extraccion material vegetal yemas"],
  "Administracion": [],
  "Logistica": []
},
  categories: [
    { name: 'Peon General', defaultRate: 4000 },
    { name: 'Tractorista', defaultRate: 4500 },
    { name: 'Capataz', defaultRate: 5000 },
    { name: 'Encargado Invernadero', defaultRate: 4500 },
    { name: 'Administracion', defaultRate: 4500 }
  ],
  periodoMode: 'semanal'
};
