// Assembles a Desk page from desk/src/page.html.
//
//   node tools/build.mjs --mode production|synthetic|preview [--out dist/desk.html]
//
// production  every marker gets its original line from private/desk-private.json (refuses if one is missing)
// synthetic   every marker gets its public stand-in (no prospect data; for tests and CI)
// preview     production data, but the page is labelled PREVIEW and every save is kept in the page instead of
//             being written to Google Drive (BUILD.preview = true; see "preview mode" in desk/src/page.html)
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const mode = args.mode || 'synthetic';
const outFile = args.out || `dist/desk-${mode}.html`;
const page = fs.readFileSync('desk/src/page.html', 'utf8');
const pub = JSON.parse(fs.readFileSync('desk/src/public-defaults.json', 'utf8'));
const priv = mode === 'synthetic' ? {} : JSON.parse(fs.readFileSync('private/desk-private.json', 'utf8'));
let missing = [];
let html = page.replace(/^@@PRIVATE (p[0-9a-f]{10})@@$/gm, (m, k) => {
  if (mode === 'synthetic') return pub[k] ?? (missing.push(k), m);
  return priv[k] ?? (missing.push(k), m);
});
if (missing.length) { console.error('build: no value for markers', missing.join(', ')); process.exit(1); }
if (mode === 'production') {   // the preview interception can never be reached from a production build
  const before = html; html = html.replace('st.mcp = BUILD.preview ? previewMcp(mcp) : mcp;', 'st.mcp = mcp;');
  if (html === before) { console.error('build: the connector line was not found; refusing to build production'); process.exit(1); }
}
if (mode === 'preview') {
  html = html.replace(/^const BUILD = \{/m, 'const BUILD = {"preview": true, ');
  html = html.replace('<title>Blocks Partner Desk</title>', '<title>Partner Desk r12 Preview</title>');
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log('build', mode, '->', outFile, Buffer.byteLength(html), 'bytes');
