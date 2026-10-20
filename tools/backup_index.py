# Writes private/backup/index.html: a private index of the backup files (purpose, size, sha256). Run after changing the set.
import hashlib, os, html, datetime, json, sys
B = 'private/backup'
PURPOSE = json.load(open(os.path.join(B, 'purposes.json')))
rows = []
for root, _, files in os.walk(B):
    for f in sorted(files):
        p = os.path.join(root, f); rel = os.path.relpath(p, B)
        if rel in ('index.html', 'purposes.json'): continue
        h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        rows.append((rel, os.path.getsize(p), h, PURPOSE.get(rel, '')))
rows.sort()
tr = '\n'.join(f'<tr><td><a href="{html.escape(r)}" target="_blank" rel="noopener">{html.escape(r)}</a></td><td>{html.escape(pu)}</td><td class="n">{s/1024:,.0f} KB</td><td><code>{h[:16]}</code></td></tr>' for r, s, h, pu in rows)
open(os.path.join(B, 'index.html'), 'w').write(f'''<title>Partner Desk Backups</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{{--bg:#f5f6f9;--panel:#fff;--ink:#141a2b;--muted:#4a536b;--line:#d9dde7;--accent:#2f55e0;--mono:ui-monospace,Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#0c1120;--panel:#151b2d;--ink:#e8ecf6;--muted:#b1b9cd;--line:#2a334b;--accent:#8fa7ff;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#0c1120;--panel:#151b2d;--ink:#e8ecf6;--muted:#b1b9cd;--line:#2a334b;--accent:#8fa7ff;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 40px}}
main{{max-width:1100px;margin:0 auto;display:grid;gap:14px}} h1{{font-size:24px;margin:0;text-wrap:balance}} p{{margin:0;max-width:75ch;color:var(--muted)}}
.tw{{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px}} table{{border-collapse:collapse;width:100%;font-size:14px}}
th{{text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line)}}
td{{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}} td.n{{font-variant-numeric:tabular-nums;white-space:nowrap}} a{{color:var(--accent)}} code{{font-family:var(--mono);font-size:12.5px}}
</style>
<main>
<h1>Partner Desk Backups</h1>
<p>Private copies of the Partner Desk and the OR-05 mailbox capture, made {datetime.datetime.utcnow().strftime("%d %b %Y %H:%M")} UTC. Each file opens as plain text, so nothing here runs. The checksum is the start of its SHA-256. The public code and history are on GitHub, branch claude/gifted-hypatia-ac8gwk; the files below hold the private parts it leaves out.</p>
<div class="tw"><table><thead><tr><th>File</th><th>What it is</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>
{tr}
</tbody></table></div>
</main>
''')
print(len(rows), 'files indexed')
