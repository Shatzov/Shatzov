# Builds a sanitized test workbook from a production export.
#
#   python3 -I tools/make_fixture.py <workbook.xlsx> <out.xlsx> <company_key>...
#
# Keeps only the rows of the named accounts (plus Config, Health_Checks and Calendar_Slots), then replaces every contact name,
# first and last name, email, domain, firm name, phone number, LinkedIn URL and Apollo id with consistent pseudonyms
# (Person 01, firm01.example, +1 555 010 0001, ...). Research, Companies, Contacts and Prep_Items free text is blanked. Config keeps
# its keys with synthetic values where a value could identify anyone. The result is still treated as private (it keeps the
# Blocks email texts and process notes): it lives under private/ and is never committed. Run tools/leakcheck.py on it after.
import sys, re, random, warnings
import pandas as pd
warnings.filterwarnings('ignore')
src, out, keys = sys.argv[1], sys.argv[2], [k.lower() for k in sys.argv[3:]]
X = pd.read_excel(src, sheet_name=None, dtype=str)
X = {t: d.fillna('') for t, d in X.items()}
random.seed(7)
KEEP_ALL = {'Config', 'Health_Checks', 'Calendar_Slots'}
DROP = {'Readme', 'Companies_bak_17Sep', 'Rejected', 'Seed Firms', 'Search Queries', 'Discovery_Failures', 'Discovery_Runs', 'Screen_Audit', 'Apollo_Log', 'Aircall_Events_TEST'}

def belongs(row, tab=''):
    if tab == 'Mail_Events' and not str(row.get('company_key', '')).strip(): return True   # events matched to no firm (pseudonymized below)
    for c in ('company_key', 'domain', 'contact_key', 'key', 'map_key', 'row_key'):
        v = str(row.get(c, '')).lower()
        if v and (v in keys or any(v.startswith(k + ' |') or v.startswith(k + '|') for k in keys)): return True
    return False

T = {}
for t, d in X.items():
    if t in DROP: continue
    if t in KEEP_ALL: T[t] = d.copy(); continue
    head = d.iloc[:1] if len(d) and str(d.iloc[0, 0]) == 'TEMPLATE' else d.iloc[:0]
    T[t] = pd.concat([head, d[d.apply(lambda r: belongs(r, t), axis=1)]])

# pseudonyms
C, Co = X['Contacts'], X['Companies']
subs = {}
firms = {}
for i, k in enumerate(keys, 1):
    firms[k] = i; subs[k] = f'firm{i:02d}.example'
    for d, col in ((C, 'domain'), (Co, 'company_key'), (X['Research'], 'company_key')):
        for f in d.loc[d[col].str.lower() == k, 'firm']:
            if f: subs[str(f)] = f'Firm {i:02d}'
pn = 0
for _, r in C.iterrows():
    dom = str(r.get('domain', '')).lower()
    if dom not in firms: continue
    pn += 1; full = str(r['full_name']).strip(); fi = firms[dom]
    if not full: continue
    subs[full] = f'Person {pn:02d}'
    parts = full.split()
    if len(parts) >= 2:
        if len(parts[0]) >= 3: subs[parts[0]] = f'Person{pn:02d}'
        if len(parts[-1]) >= 3: subs[parts[-1]] = f'Surname{pn:02d}'
    if r.get('email'): subs[str(r['email'])] = f'person{pn:02d}@firm{fi:02d}.example'
    if r.get('linkedin_url'): subs[str(r['linkedin_url'])] = f'https://www.linkedin.com/in/person{pn:02d}'
    if r.get('apollo_person_id'): subs[str(r['apollo_person_id'])] = ''.join(random.choice('0123456789abcdef') for _ in range(24))
# other people named in mailbox events (colleagues who wrote in)
for t in ('Mail_Events',):
    for v in T.get(t, pd.DataFrame()).get('from', []):
        for e in re.findall(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', str(v)):
            if e not in subs: subs[e] = f'colleague{len(subs):03d}@example.com'
        nm = re.sub(r'<[^>]*>', '', str(v)).strip(' "')
        if nm and '@' not in nm and nm not in subs and len(nm) > 4: subs[nm] = f'Colleague {len(subs):03d}'
# catch-all: every other company domain and contact name in the workbook (they appear in notes, reasons and heartbeat details)
for d, col in ((Co, 'company_key'), (C, 'domain'), (X['Research'], 'company_key')):
    for v in d[col]:
        v = str(v).strip().lower()
        if '.' in v and len(v) > 4 and v not in subs: subs[v] = 'other.example'
for v in C['full_name']:
    v = str(v).strip()
    if ' ' in v and len(v) > 5 and v not in subs: subs[v] = 'Someone Else'
order = sorted(subs, key=len, reverse=True)
pat = re.compile('|'.join(re.escape(s) for s in order if s), re.I)
PHONE = re.compile(r'(\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b|(?<!\d)\+?1?\d{10}(?!\d)')   # formatted, or E.164 / bare digits
phones = {}
def fone(m):
    k = re.sub(r'\D', '', m.group(0))[-10:]
    if k not in phones: phones[k] = '+1 555 010 %04d' % (len(phones) + 1)
    return phones[k]
low = {k.lower(): v for k, v in subs.items()}
def clean(v):
    if not v: return v
    v = pat.sub(lambda m: low.get(m.group(0).lower(), m.group(0)), v)
    v = re.sub(r'\b[\w.+-]+@(?!(firm\d\d\.example|example\.com)\b)[\w-]+(?:\.[\w-]+)+', 'someone@example.com', v)
    return PHONE.sub(fone, v)
FREE = {'Research': lambda c: c not in ('company_key', 'firm', 'primary_contact_key', 'backup_contact_key', 'outreach_eligibility', 'partner_stage', 'stage_entered_at', 'stage_owner', 'stage_next_step', 'stage_next_due', 'stage_closed_reason', 'priority_company', 'first10_rank', 'pilot_variant', 'cluster'),
        'Companies': lambda c: c not in ('company_key', 'firm', 'website', 'hq', 'hq_phone', 'priority', 'ecosystem', 'erps', 'date_added', 'source'),
        'Contacts': lambda c: c in ('why_this_person', 'phone_request_id', 'title'),
        'Prep_Items': lambda c: c not in ('company_key', 'state', 'action_owner', 'contact_key', 'requested_at', 'updated_at')}
for t, d in T.items():
    for c in d.columns:
        if t in FREE and FREE[t](c): d[c] = d[c].map(lambda v: 'synthetic' if v and v != 'TEMPLATE' else v)
        else: d[c] = d[c].map(clean)
cfg = T['Config']
SAFE = {'sender_address': 'desk@example.com', 'mail_capture_verified_mailbox': 'desk@example.com', 'us_number': '+1 555 010 0000', 'calendar_link': 'TBD', 'test_recipient': 'TBD',
        'desk_url': 'https://example.com/desk', 'aircall_webhook_id': '', 'aircall_webhook_token_sha256': '', 'aircall_number_id': '1000000', 'aircall_user_id': '1000001',
        'meeting_people': 'itamar=itamar@example.com,amitai=amitai@example.com', 'israel_holiday_calendar': 'holidays@example.com', 'signature_block': '--\nThe sender', 'signature_html': '<p>The sender</p>',
        'approved_job_keys': '', 'prep_rescreen_keys': '', 'mail_capture_last_report': '{}', 'operating_decision_note': 'synthetic', 'discovery_exhausted': '{}', 'discovery_coverage': '{}'}
cfg['value'] = [SAFE.get(k, clean(v)) for k, v in zip(cfg['key'], cfg['value'])]
with pd.ExcelWriter(out) as w:
    for t, d in T.items(): d.to_excel(w, sheet_name=t, index=False)
print('fixture', out, {t: len(d) for t, d in T.items() if len(d)})
