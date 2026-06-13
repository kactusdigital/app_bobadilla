import re
import json

with open('viveros-bobadilla-app-v4.html', 'r', encoding='utf-8') as f:
    content = f.read()

actividades_match = re.search(r'const ACTIVIDADES = ({.*?});', content, re.DOTALL)
if actividades_match:
    act_str = actividades_match.group(1).replace("'", '"')
    try:
        actividades = list(json.loads(act_str).keys())
    except:
        keys = re.findall(r'"([^"]+)":\s*\[', act_str)
        if not keys:
            keys = re.findall(r"'([^']+)':\s*\[", act_str)
        actividades = keys
else:
    actividades = []

data_match = re.search(r'const DEFAULT_DATA = ({.*?});\s*function loadData', content, re.DOTALL)
if data_match:
    data_str = data_match.group(1)
    
    workers_raw = re.findall(r"\{ nombre:\s*['\"](.*?)['\"],\s*categoria:\s*['\"](.*?)['\"]\s*\}", data_str)
    
    cat_match = re.search(r'categorias:\s*\[(.*?)\]', data_str, re.DOTALL)
    categorias = {}
    if cat_match:
        cats = re.findall(r"\{ nombre:\s*['\"](.*?)['\"],\s*precioHora:\s*(\d+)\s*\}", cat_match.group(1))
        for c_name, c_price in cats:
            categorias[c_name] = int(c_price)
            
    lug_match = re.search(r'lugares:\s*\[(.*?)\]', data_str, re.DOTALL)
    if lug_match:
        lugares = [l.strip().strip("'").strip('"') for l in lug_match.group(1).split(',')]
    else:
        lugares = []
        
    esp_match = re.search(r'especies:\s*\[(.*?)\]', data_str, re.DOTALL)
    if esp_match:
        especies = [e.strip().strip("'").strip('"') for e in esp_match.group(1).split(',')]
    else:
        especies = []

    ts_workers = []
    for i, (name, cat) in enumerate(workers_raw):
        rate = categorias.get(cat, 4000)
        worker_str = f"""  {{
    id: 'w{i+1}',
    name: '{name}',
    category: '{cat}',
    regime: 'temporal',
    hourlyRate: {rate},
    isActive: true,
    legajo: '#{1000 + i}'
  }}"""
        ts_workers.append(worker_str)

    ts_categories = []
    for c_name, c_price in categorias.items():
        ts_categories.append(f"    {{ name: '{c_name}', defaultRate: {c_price} }}")

    with open('src/initialData.ts', 'w') as out:
        out.write("import { Worker, MasterCatalogs } from './types';\n\n")
        out.write("export const DEFAULT_WORKERS: Worker[] = [\n")
        out.write(",\n".join(ts_workers))
        out.write("\n];\n\n")
        
        out.write("export const DEFAULT_CATALOGS: MasterCatalogs = {\n")
        
        out.write("  locations: [\n")
        out.write(",\n".join([f"    '{l}'" for l in lugares if l]))
        out.write("\n  ],\n")
        
        out.write("  species: [\n")
        out.write(",\n".join([f"    '{s}'" for s in especies if s]))
        out.write("\n  ],\n")
        
        out.write("  activities: [\n")
        out.write(",\n".join([f"    '{a}'" for a in actividades if a]))
        out.write("\n  ],\n")
        
        out.write("  categories: [\n")
        out.write(",\n".join(ts_categories))
        out.write("\n  ]\n")
        out.write("};\n")

    print("Success")
else:
    print("Could not find DEFAULT_DATA")

