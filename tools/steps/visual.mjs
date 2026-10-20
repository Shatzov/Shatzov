// Element screenshots of the r12 rows (grouped mailbox events, callbacks, the late-withdrawal note) and a page-width check.
export default async function (page, ctx) {
  const shots = [['mailgroup', 'li.r12mg'], ['callbacks', '[data-testid="r11-callbacks"]'], ['note', 'li.trw.fix:has(.chip:text("Still in effect"))']];
  for (const [name, sel] of shots) { const el = page.locator(sel).first(); if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: ctx.shotPath ? ctx.shotPath(name) : `${process.env.OUT_DIR}/${name}.png` }); } }
  const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log(JSON.stringify({ visual: 'ok', horizontal_overflow: sw.sw > sw.cw, ...sw }));
}
