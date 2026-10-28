import json,re,zipfile
from pathlib import Path
z=zipfile.ZipFile('/mnt/user-uploads/KYC_PF_PJ_corecte_si_gresite.zip')
pj=json.loads(z.read(next(n for n in z.namelist() if n.endswith('playbook_pj_original.json'))))
text=Path('/tmp/procedure_pj.txt').read_text()
text=re.sub(r'^.*Page \d of \d.*$','',text,flags=re.M)
text=re.sub(r'^Procedura PJ-ONB-01: Deschiderea contului curent pentru persoane juridice\s*$','',text,flags=re.M)
clauses=[]
parts=list(re.finditer(r'(?m)^(\d+\.\d+)\.\s',text))
for i,m in enumerate(parts):
 end=parts[i+1].start() if i+1<len(parts) else text.index('\nSurse',m.end())
 body=text[m.end():end].strip()
 body=re.split(r'\n\n\d+\. ',body)[0]
 body=' '.join(body.split())
 ids=[r['rule_id'] for r in pj['rules'] if r['source_ref']['clause']==m[1]]
 status='Automatizată' if ids else 'Context' if m[1].startswith('1.') or m[1]=='3.2' else 'Acoperită' if m[1] in ['2.3','2.5','9.1','9.5'] else 'Manuală' if m[1] in ['4.3','7.2','9.2'] else 'Neverificată'
 clauses.append(dict(number=m[1],text=body,status=status,ruleIds=ids))
policies={r['rule_id']:{'client_fixable':r['client_fixable'],'fix_message':r['fix_message']} for r in pj['rules']}
for n in z.namelist():
 if n.endswith('pipeline_result.json'):
  for f in json.loads(z.read(n))['flags']:
   policies[f['rule_id']]={'client_fixable':f.get('client_fixable',False),'fix_message':f.get('fix_message')}
out={'pjSourceText':text.strip(),'pjClauses':clauses,'policies':policies,'pjRequiredDocuments':[d['doc_type'] for d in pj['required_documents']]}
Path('src/mocks/review-fixtures.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
