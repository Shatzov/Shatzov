// Local browser harness for the Blocks Partner Desk.
//
// Loads a Desk build in headless Chromium with a stub of the claude.ai runtime:
//   - mcp: "Google Drive" download_file_content serves a local .xlsx export; create_file is CAPTURED, never sent.
//   - db:  an in-memory document store.
// Nothing leaves the machine. Usage:
//   node tools/harness.mjs --html desk/build/index.html --xlsx <workbook.xlsx> --out <dir> [--now 2026-10-21T14:05:00Z]
//        [--width 1366] [--script <steps.mjs>]
// A steps module exports `default async function (page, ctx)`; ctx has { shot(name), writes(), state() }.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const html = path.resolve(args.html || 'desk/build/index.html');
const out = path.resolve(args.out || 'harness-out');
fs.mkdirSync(out, { recursive: true });
const b64 = args.xlsx ? fs.readFileSync(args.xlsx).toString('base64') : null;

const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
const ctxB = await browser.newContext({ viewport: { width: Number(args.width || 1366), height: Number(args.height || 900) }, timezoneId: args.tz || 'Asia/Jerusalem' });
const page = await ctxB.newPage();
if (args.now) await page.clock.install({ time: new Date(args.now) });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
// Block every network request except the page itself and fonts (fonts are optional; blocking keeps runs offline-safe).
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.exposeFunction('__harnessB64', () => b64);
await page.addInitScript(() => {
  const writes = []; window.__harnessWrites = writes;
  const docs = new Map();
  const db = {
    doc: (p) => ({
      get: async () => (docs.has(p) ? { exists: true, data: () => JSON.parse(docs.get(p)) } : { exists: false, data: () => null }),
      set: async (v) => { docs.set(p, JSON.stringify(v)); },
      update: async (v) => { docs.set(p, JSON.stringify(Object.assign(docs.has(p) ? JSON.parse(docs.get(p)) : {}, v))); },
      delete: async () => { docs.delete(p); },
    }),
  };
  const deliver = async (cb) => { const content = await window.__harnessB64(); cb({ type: 'data', result: { content: [{ type: 'text', text: JSON.stringify({ content }) }] } }); };
  let watcher = null;
  const mcp = {
    watchTool: (server, tool, input, cb) => { watcher = cb; setTimeout(() => deliver(cb), 30); return () => { watcher = null; }; },
    invalidate: async () => { if (watcher) setTimeout(() => deliver(watcher), 30); },
    callTool: async (server, tool, input) => {
      if (tool === 'download_file_content') { const content = await window.__harnessB64(); return { content: [{ type: 'text', text: JSON.stringify({ content }) }] }; }
      if (tool === 'create_file') { writes.push({ server, tool, input, at: new Date().toISOString() }); const id = 'harness_' + writes.length; return { content: [{ type: 'text', text: JSON.stringify({ id, title: input.title, parents: [input.parentId] }) }], payload: { id, parents: [input.parentId] } }; }
      throw Object.assign(new Error('harness: tool not stubbed ' + tool), { code: 'not_in_manifest' });
    },
  };
  window.claude = { use: async (cap) => (cap === 'mcp' ? mcp : cap === 'db' ? db : null) };
});
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.__deskState && window.__deskState.model && window.__deskState.source === 'live', null, { timeout: 120000 });
await page.waitForTimeout(800);
const ctx = {
  shot: async (name, opts = {}) => { const f = path.join(out, name + '.png'); await page.screenshot(Object.assign({ path: f, fullPage: true }, opts)); return f; },
  writes: () => page.evaluate(() => window.__harnessWrites),
  state: (fn) => page.evaluate(fn || (() => null)),
  logs,
};
if (args.script) { const mod = await import(pathToFileURL(path.resolve(args.script)).href); await mod.default(page, ctx); }
else await ctx.shot('today');
fs.writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
fs.writeFileSync(path.join(out, 'writes.json'), JSON.stringify(await ctx.writes(), null, 1));
await browser.close();
console.log('harness done:', out, 'console lines', logs.length);
