# Leak check for this PUBLIC repository.
# Usage: python3 -I tools/leakcheck.py <workbook.xlsx> <file>...
# Fails (exit 1) when any file contains a contact name, contact email, company domain or phone number from the workbook.
import sys, re, pandas as pd, warnings, collections; warnings.filterwarnings('ignore')
x=pd.read_excel(sys.argv[1],sheet_name=['Contacts','Companies'],dtype=str)
c=x['Contacts']; co=x['Companies']
terms=set()
for v in c.full_name.dropna(): 
    v=v.strip()
    if len(v)>5 and ' ' in v: terms.add(v)
for col in ['email']:
    for v in c[col].dropna(): terms.add(v.strip().lower())
for v in pd.concat([c.domain,co.company_key]).dropna():
    v=v.strip().lower()
    if '.' in v and len(v)>5: terms.add(v)
phones=set(re.sub(r'\D','',v)[-10:] for v in pd.concat([c.mobile_direct,c.hq_phone,co.hq_phone]).dropna() if len(re.sub(r'\D','',v))>=10)
bad=False
for f in sys.argv[2:]:
    if f.endswith('.xlsx'): s='\n'.join(d.fillna('').to_csv(index=False) for d in pd.read_excel(f,sheet_name=None,dtype=str).values())   # cell text, not the zip
    else: s=open(f,encoding='utf8',errors='ignore').read()
    low=s.lower(); digits=re.sub(r'\D','',s)
    hits=[t for t in terms if t.lower() in low]; ph=[p for p in phones if p in digits]
    if hits or ph:
        bad=True; print('LEAK', f, 'terms', len(hits), 'phones', len(ph))
sys.exit(1 if bad else print('leakcheck: clean,', len(sys.argv)-2, 'files') or 0)
