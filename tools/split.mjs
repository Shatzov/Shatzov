// Splits a full Desk page (as published) into a public source file and a private data file.
//
//   node tools/split.mjs <published.html>
//
// Writes:
//   desk/src/page.html            the page, with every data-carrying line replaced by a marker line "@@PRIVATE <key>@@"
//   desk/src/public-defaults.json key -> a safe stand-in line (used by synthetic/test builds)
//   private/desk-private.json     key -> the original line (git-ignored; needed for the production build)
//
// A line is private when it is the embedded research block, the build configuration, a dated plan or data constant, or
// carries a phone number. The repository is public: nothing about prospects may be committed. Run tools/leakcheck.py after.
import fs from 'node:fs';
import crypto from 'node:crypto';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/split.mjs <published.html>'); process.exit(2); }
const lines = fs.readFileSync(src, 'utf8').split('\n');
const PHONE = /(\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b|\+1\d{10}|\b\d{10}(ext|x)\d+|\b1 ?888 ?\d{3} ?\d{4}\b/;
const rules = [
  { test: (l) => /^<script type="application\/json" id="prep">/.test(l), stand: () => '<script type="application/json" id="prep">{}</script>' },
  { test: (l) => /^const BUILD = \{/.test(l), stand: (l) => publicBuild(l) },
  { test: (l) => /^const (NUM_FIX|NX_APPROVED) = /.test(l), stand: (l) => l.replace(/^(const \w+ = )([\[{]).*$/, (m, a, b) => a + (b === '[' ? '[];' : '{};')) },
  { test: (l) => /^\s*\{ id: '\w+', label: '[^']*', day: '\d{4}-\d{2}-\d{2}', people: \[/.test(l), stand: (l) => l.replace(/people: \[[^\]]*\]/, 'people: []') },
  { test: (l) => /@blocks\.diy/.test(l), stand: (l) => l.replace(/[\w.+-]+@blocks\.diy/g, 'owner@example.com') },
  { test: (l) => PHONE.test(l), stand: (l) => l.replace(new RegExp(PHONE.source, 'g'), '(555) 010-0000') },
];
function publicBuild(l) {
  const j = JSON.parse(l.replace(/^const BUILD = /, '').replace(/;\s*$/, ''));
  j.file_id = 'SYNTHETIC_WORKBOOK_ID';
  if (j.log) j.log = Object.assign({}, j.log, { inbox: 'SYNTHETIC_INBOX_ID', label: 'SYNTHETIC' });
  return 'const BUILD = ' + JSON.stringify(j) + ';';
}
const pub = {}, priv = {}; let n = 0;
const out = lines.map((l) => {
  const r = rules.find((x) => x.test(l)); if (!r) return l;
  const key = 'p' + crypto.createHash('sha1').update(l).digest('hex').slice(0, 10);
  priv[key] = l; pub[key] = r.stand(l); n++;
  return '@@PRIVATE ' + key + '@@';
});
fs.mkdirSync('desk/src', { recursive: true }); fs.mkdirSync('private', { recursive: true });
fs.writeFileSync('desk/src/page.html', out.join('\n'));
fs.writeFileSync('desk/src/public-defaults.json', JSON.stringify(pub, null, 1) + '\n');
fs.writeFileSync('private/desk-private.json', JSON.stringify(priv));
console.log('split', src, ':', n, 'private lines');
