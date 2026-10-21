#!/usr/bin/env bash
# Desk checks. Needs: node with playwright (global), python3 with pandas/openpyxl, and a production workbook export
#   tools/test.sh <workbook.xlsx> [published-desk.html]
# The workbook never leaves this machine; the sanitized fixture is written to private/ (git-ignored).
set -euo pipefail
W="$1"; PUB="${2:-}"
export NODE_PATH="$(npm root -g)"; [ -e node_modules ] || ln -s "$NODE_PATH" node_modules
OUT="$(mktemp -d)"
echo "1. builds"; node tools/build.mjs --mode synthetic --out dist/desk-synthetic.html; node tools/build.mjs --mode production --out dist/desk-production.html; node tools/build.mjs --mode preview --out dist/desk-preview.html
if [ -n "$PUB" ]; then echo "   baseline identity"; git show "$(git rev-list --max-parents=0 HEAD)":desk/src/page.html > "$OUT/base.html"; node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('private/desk-private.json'));const s=fs.readFileSync('$OUT/base.html','utf8').replace(/^@@PRIVATE (p[0-9a-f]{10})@@\$/gm,(m,k)=>p[k]);process.exit(s===fs.readFileSync('$PUB','utf8')?0:1)" && echo "   baseline rebuild == published page"; fi
echo "2. leak check (public files)"; python3 -I tools/leakcheck.py "$W" desk/src/page.html desk/src/public-defaults.json dist/desk-synthetic.html tools/*.mjs tools/steps/*.mjs tools/*.py $(ls n8n/*/*.js n8n/*/*.md n8n/*/*.mjs 2>/dev/null) tools/*.sh README.md
echo "3. sanitized fixture"; python3 -I tools/make_fixture.py "$W" private/fixture.xlsx $(cat private/fixture-accounts.txt) >/dev/null; python3 -I tools/leakcheck.py "$W" private/fixture.xlsx
echo "4. r12 acceptance on the fixture"; node tools/harness.mjs --html dist/desk-production.html --xlsx private/fixture.xlsx --out "$OUT/fx" --now 2026-10-20T20:40:00Z --script tools/steps/r12-fixture.mjs
echo "4b. r12 edge cases"; python3 -I - <<'PY'
import pandas as pd, warnings; warnings.filterwarnings('ignore')
x = pd.read_excel('private/fixture.xlsx', sheet_name=None, dtype=str); m = x['Meetings'].fillna('')
i = m.index[m['company_key'] == 'firm01.example']; m.loc[i, 'outcome_branch'] = 'cancelled'; m.loc[i, 'updated_at'] = '2026-10-20T19:00:00.000Z'; x['Meetings'] = m
with pd.ExcelWriter('private/fixture-ended.xlsx') as w:
    for t, d in x.items(): d.to_excel(w, sheet_name=t, index=False)
PY
for mode in mixed fail lost reload orphan; do
  ENV=""; [ $mode = fail ] && ENV="HARNESS_FAIL=3"; [ $mode = lost ] && ENV="HARNESS_FAIL_AFTER=2"
  env MODE=$mode $ENV node tools/harness.mjs --html dist/desk-production.html --xlsx private/fixture.xlsx --out "$OUT/edge-$mode" --now 2026-10-20T20:40:00Z --script tools/steps/r12-edge.mjs | grep -v "harness done"
done
MODE=ended node tools/harness.mjs --html dist/desk-production.html --xlsx private/fixture-ended.xlsx --out "$OUT/edge-ended" --now 2026-10-20T20:40:00Z --script tools/steps/r12-edge.mjs | grep -v "harness done"
echo "4c. r13 unmatched mailbox events"; python3 -I - <<'PY'
import pandas as pd, warnings; warnings.filterwarnings('ignore')
x = pd.read_excel('private/fixture.xlsx', sheet_name=None, dtype=str); m = x['Mail_Events'].fillna('')
i = m.index[m['message_id'] == '1a1455c3a30fdbc3']; m.loc[i, 'status'] = 'ignored'; m.loc[i, 'resolved_at'] = '2026-10-20T10:00:00.000Z'; m.loc[i, 'resolved_by'] = 'Itamar (Desk eabcdefgh123)'
m.loc[i, 'reason'] = m.loc[i, 'reason'] + ' [desk ignored 2026-10-20T10:00Z by Itamar (Desk eabcdefgh123): test]'; x['Mail_Events'] = m
d = x['Desk_Import'].fillna(''); d.loc[len(d)] = {'event_id': 'erejectr13test1', 'file_id': 'f', 'file_name': 'desk-log_erejectr13test1.json', 'imported_at': '2026-10-20T20:35:00.000Z', 'company_key': 'firm02.example', 'contact_key': '', 'action': 'mail_event_resolve', 'status': 'rejected', 'reason': 'say how you confirmed whom it concerns (a few words; it stays with the event)', 'writes': '', 'activity_id': ''}; x['Desk_Import'] = d
with pd.ExcelWriter('private/fixture-r13.xlsx') as w:
    for t, v in x.items(): v.to_excel(w, sheet_name=t, index=False)
PY
for mode in form ignore fail lost reload rejected reopen; do
  ENV=""; [ $mode = fail ] && ENV="HARNESS_FAIL=1"; [ $mode = lost ] && ENV="HARNESS_FAIL_AFTER=1"; FX=private/fixture.xlsx; [ $mode = rejected -o $mode = reopen ] && FX=private/fixture-r13.xlsx
  env MODE=$mode $ENV node tools/harness.mjs --html dist/desk-production.html --xlsx $FX --out "$OUT/r13-$mode" --now 2026-10-20T20:40:00Z --script tools/steps/r13-mail.mjs | grep -v "harness done"
done
echo "4d. mailbox-event importer node"; [ -f private/mailfix/test_mailfix.mjs ] && node private/mailfix/test_mailfix.mjs | tail -1 || echo "   (private importer test not present; skipped)"
echo "5. preview never writes"; node tools/harness.mjs --html dist/desk-preview.html --xlsx private/fixture.xlsx --out "$OUT/pv" --now 2026-10-20T20:40:00Z --script tools/steps/preview.mjs
echo "6. phone width"; OUT_DIR="$OUT/vis" node tools/harness.mjs --html dist/desk-production.html --xlsx private/fixture.xlsx --out "$OUT/vis" --width 390 --now 2026-10-20T20:40:00Z --script tools/steps/visual.mjs
echo "7. OR-05 capture tests"; node n8n/or05-capture-1.10.1/test.mjs | tail -1
echo "all checks passed ($OUT)"
