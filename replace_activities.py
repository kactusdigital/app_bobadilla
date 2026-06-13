import re
with open('viveros-bobadilla-app-v4.html', 'r', encoding='utf-8') as f:
    content = f.read()

actividades_match = re.search(r'const ACTIVIDADES = ({.*?});', content, re.DOTALL)
if actividades_match:
    act_str = actividades_match.group(1)
    with open('src/initialData.ts', 'r', encoding='utf-8') as f:
        ts_content = f.read()
    
    # Replace activities array with dict
    new_content = re.sub(r'activities:\s*\[.*?\]', f'activities: {act_str}', ts_content, flags=re.DOTALL)
    
    with open('src/initialData.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Replaced activities.")
