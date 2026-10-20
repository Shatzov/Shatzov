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
echo "5. preview never writes"; node tools/harness.mjs --html dist/desk-preview.html --xlsx private/fixture.xlsx --out "$OUT/pv" --now 2026-10-20T20:40:00Z --script tools/steps/preview.mjs
echo "6. phone width"; OUT_DIR="$OUT/vis" node tools/harness.mjs --html dist/desk-production.html --xlsx private/fixture.xlsx --out "$OUT/vis" --width 390 --now 2026-10-20T20:40:00Z --script tools/steps/visual.mjs
echo "all checks passed ($OUT)"
