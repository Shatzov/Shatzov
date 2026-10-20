// Writes the visible text of the Today view, section by section, plus the top viewport screenshot.
import fs from 'node:fs';
export default async function (page, ctx) {
  await ctx.shot('top', { fullPage: false });
  const secs = await page.evaluate(() => Array.from(document.querySelectorAll('.view:not([hidden]) > *, .view:not([hidden]) section, .view:not([hidden]) details.tg')).map(el => ({ tag: el.tagName, cls: el.className, id: el.id, sec: el.dataset && el.dataset.sec, text: el.innerText })));
  fs.writeFileSync(process.env.OUT_TXT || 'today.txt', secs.map(s => `=== ${s.tag}#${s.id}.${s.cls} [${s.sec || ''}]\n${s.text}`).join('\n\n'));
}
