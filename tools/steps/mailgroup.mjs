// r12: the grouped mailbox row saves one conversation_sent entry per hand-written email, once, even on a double click.
import assert from 'node:assert/strict';
export default async function (page, ctx) {
  const groups = await page.$$('[data-testid^="wl-mailgrp-"][data-testid$="."], li.r12mg');
  assert.ok(groups.length > 0, 'at least one grouped mailbox row');
  const btn = (process.env.MG_KEY ? page.locator(`li.r12mg[data-testid="wl-mailgrp-${process.env.MG_KEY}"] [data-testid="wl-mailgrp-conv-all"]`) : page.locator('li.r12mg [data-testid="wl-mailgrp-conv-all"]')).first();
  const label = await btn.textContent();
  const n = Number((/All (\d+)/.exec(label) || [0, 1])[1]);
  const li = btn.locator('xpath=ancestor::li[contains(@class,"r12mg")]');
  const key = (await li.getAttribute('data-testid')).replace('wl-mailgrp-', '');
  await ctx.shot('mailgroup-before', { fullPage: false });
  await btn.dblclick();
  await page.waitForFunction((k) => !document.querySelector(`li.r12mg[data-testid="wl-mailgrp-${k}"] [data-testid="wl-mailgrp-conv-all"]`) || /Saving/.test(document.querySelector(`li.r12mg[data-testid="wl-mailgrp-${k}"] [data-testid="wl-mailgrp-conv-all"]`).textContent) === false, key, { timeout: 20000 });
  await page.waitForTimeout(500);
  const w = (await ctx.writes()).filter((x) => x.tool === 'create_file');
  const entries = w.map((x) => JSON.parse(x.input.textContent));
  assert.equal(entries.length, n, `exactly ${n} files saved (got ${entries.length})`);
  for (const e of entries) {
    assert.equal(e.action, 'mail_review'); assert.equal(e.outcome, 'conversation_sent'); assert.equal(e.company_key, key);
    assert.ok(e.mail && e.mail.message_id, 'each entry names its mailbox message');
  }
  assert.equal(new Set(entries.map((e) => e.mail.message_id)).size, n, 'one entry per message');
  assert.equal(new Set(entries.map((e) => e.event_id)).size, n, 'distinct event ids');
  const after = await page.locator(`li.r12mg[data-testid="wl-mailgrp-${key}"]`).count();
  const savedLine = await page.locator(`li.r12mg[data-testid="wl-mailgrp-${key}"] [data-testid="wl-mailgrp-saved"]`).count();
  const savedSection = await page.locator('[data-testid="wl-group-saved"]').count();
  console.log(JSON.stringify({ group: 'ok', saved: entries.length, row_still_listed: after, saved_line: savedLine, saved_section: savedSection }));
  await ctx.shot('mailgroup-after', { fullPage: false });
}
