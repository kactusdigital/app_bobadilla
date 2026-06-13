import re

with open('src/components/AddEntry.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Update WorkerFormState
content = re.sub(
    r'interface WorkerFormState {.*?}',
    '''interface WorkerFormState {
  location: string;
  quadro: string;
  specie: string;
  activity: string;
  subtask: string;
  quantity: number;
  amount: number;
  rate: number;
  notes: string;
  paymentMethod: string;
}''',
    content,
    flags=re.DOTALL
)

# Update initialize forms logic
content = re.sub(
    r'newForms\[wId\] = forms\[wId\] \|\| \{.*?\}',
    '''newForms[wId] = forms[wId] || {
        location: catalogs.locations[0] || '',
        quadro: '',
        specie: catalogs.species[0] || '',
        activity: Object.keys(catalogs.activities)[0] || '',
        subtask: '',
        quantity: isHoursType ? 8 : 10,
        amount: 0,
        rate: catalogs.categories.find(c => c.name === workers.find(w => w.id === wId)?.category)?.defaultRate || 4000,
        notes: '',
        paymentMethod: 'efectivo'
      }''',
    content,
    flags=re.DOTALL
)

# Replace tpl state
content = re.sub(
    r'const \[tplActivity, setTplActivity\] = useState\(\'\'\);',
    '''const [tplActivity, setTplActivity] = useState('');
  const [tplSubtask, setTplSubtask] = useState('');
  const [tplRate, setTplRate] = useState<number | ''>('');''',
    content
)

# Update applyTemplate
applyTemplate_replacement = '''
  const applyTemplate = () => {
    const newForms = { ...forms };
    selectedWorkers.forEach(wId => {
      if (tplLocation) newForms[wId].location = tplLocation;
      if (tplQuadro) newForms[wId].quadro = tplQuadro;
      if (tplSpecie) newForms[wId].specie = tplSpecie;
      if (tplActivity) {
        newForms[wId].activity = tplActivity;
        newForms[wId].subtask = tplSubtask;
      }
      if (tplQuantity !== '') newForms[wId].quantity = Number(tplQuantity);
      if (tplRate !== '') newForms[wId].rate = Number(tplRate);
    });
    setForms(newForms);
  };
'''
content = re.sub(r'const applyTemplate = \(\) => \{.*?\n  \};', applyTemplate_replacement.strip(), content, flags=re.DOTALL)

# Update UI mapping of activities from array to Object.keys
content = content.replace('catalogs.activities.map(a', 'Object.keys(catalogs.activities).map(a')

with open('src/components/AddEntry.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("AddEntry partial regex apply done.")
