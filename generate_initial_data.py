import json

with open('Bobadilla_Backup_V4_2026-06-02.json', 'r') as f:
    data = json.load(f)

workers = data.get('workers', [])
categorias = data.get('categorias', [])
lugares = data.get('lugares', [])
especies = data.get('especies', [])

# From HTML
actividades = [
  "Preparacion de suelo", "Riego", "Injertada", "Colocar Tela Antigranizo",
  "Sacado Tela Antigranizo", "Estaquillado Lenoso", "Estaquillado herbaceo",
  "Desmalezado manual", "Escardillado", "Desbrotes", "Desmalezado con herbicida",
  "Curaciones", "Transplante", "Encepada", "Almacigos", "Cosecha",
  "Secado de Nuez", "Fertilizacion", "Arrancada", "Despacho de plantas",
  "Administracion", "Logistica"
]

category_map = {}
for c in categorias:
    category_map[c['nombre']] = c.get('precioHora', 4000)

ts_workers = []
for i, w in enumerate(workers):
    cat = w.get('categoria', 'Peon General')
    rate = category_map.get(cat, 4000)
    salary = w.get('sueldoMensual')
    
    worker_str = f"""  {{
    id: 'w{i+1}',
    name: '{w['nombre']}',
    category: '{cat}',
    regime: '{w.get('regimen', 'temporal')}',
    hourlyRate: {rate},"""
    
    if salary:
        worker_str += f"\n    fixedSalary: {salary},"
        
    worker_str += f"""
    isActive: true,
    legajo: '#{1000 + i}'
  }}"""
    ts_workers.append(worker_str)


ts_categories = []
for c in categorias:
    ts_categories.append(f"    {{ name: '{c['nombre']}', defaultRate: {c.get('precioHora', 4000)} }}")

with open('src/initialData.ts', 'w') as f:
    f.write("import { Worker, MasterCatalogs } from './types';\n\n")
    f.write("export const DEFAULT_WORKERS: Worker[] = [\n")
    f.write(",\n".join(ts_workers))
    f.write("\n];\n\n")
    
    f.write("export const DEFAULT_CATALOGS: MasterCatalogs = {\n")
    
    f.write("  locations: [\n")
    f.write(",\n".join([f"    '{l}'" for l in lugares]))
    f.write("\n  ],\n")
    
    f.write("  species: [\n")
    f.write(",\n".join([f"    '{s}'" for s in especies]))
    f.write("\n  ],\n")
    
    f.write("  activities: [\n")
    f.write(",\n".join([f"    '{a}'" for a in actividades]))
    f.write("\n  ],\n")
    
    f.write("  categories: [\n")
    f.write(",\n".join(ts_categories))
    f.write("\n  ]\n")
    f.write("};\n")
