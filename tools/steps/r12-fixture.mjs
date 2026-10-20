// r12 acceptance checks on the sanitized fixture (private/fixture.xlsx built with the accounts named in tools/test.sh).
// Run with --now 2026-10-20T20:40:00Z (the moment the fixture was exported) unless a check sets its own clock.
import assert from 'node:assert/strict';
export default async function (page, ctx) {
  const text = (sel) => page.locator(sel).first().innerText();
  const now = await text('[data-testid="wl-group-now"]');
  // 1. grouped mailbox events: one row per person, with the account context and the one-step action
  const groups = await page.locator('li.r12mg').count();
  assert.equal(groups, 2, 'two people with several mailbox events -> two grouped rows');
  assert.match(now, /5 mailbox events to resolve: 5 emails you wrote by hand/);
  assert.match(now, /7 mailbox events to resolve: 4 emails you wrote by hand · 3 emails from/);
  assert.match(now, /Meeting held \(Tue 20 Oct\) with this account/);
  assert.equal(await page.locator('li.r12mg [data-testid="wl-mailgrp-conv-all"]').count(), 2);
  assert.equal(await page.locator('li.r12mg details.r12mgd li.trw').count(), 12, 'every message is still listed under its group');
  // 2. refusals: the late withdrawal is a note, the entries refused because you withdrew their group are not tasks
  assert.match(now, /NOTE[\s\S]*Your withdrawal came after it took effect/);
  assert.doesNotMatch(now, /was withdrawn \(Thu 15 Oct 2026, 18:36 Israel time\); nothing of it was applied/);
  assert.doesNotMatch(now, /Fix and save again[\s\S]*already applied; stop or change it/);
  // 3. the open callback says how overdue it is and when to call
  const cb = await text('[data-testid="r11-callbacks"]');
  assert.match(cb, /Overdue · \d+ working days since your try/);
  assert.match(cb, /Next preferred hour Wed 21 Oct, 10:00 to 11:00 EDT \(17:00 to 18:00 Israel\)/);
  assert.match(cb, /Closing the callback releases the held steps/);
  // 4. no false calendar alarm at 23:40 Israel (the heartbeat's fresh verdict is ok)
  assert.doesNotMatch(await page.locator('body').innerText(), /Google Calendar \(CAL-01\): late/);
  // the one-step action on the 5-email group: a double click saves 5 entries, each once
  const btn = page.locator('li.r12mg', { hasText: '5 mailbox events' }).locator('[data-testid="wl-mailgrp-conv-all"]');
  await btn.dblclick(); await page.waitForTimeout(2500);
  const e = (await ctx.writes()).filter((w) => w.tool === 'create_file').map((w) => JSON.parse(w.input.textContent));
  assert.equal(e.length, 5); assert.ok(e.every((x) => x.action === 'mail_review' && x.outcome === 'conversation_sent'));
  assert.equal(new Set(e.map((x) => x.mail.message_id)).size, 5); assert.equal(new Set(e.map((x) => x.event_id)).size, 5);
  assert.equal(await page.locator('li.r12mg').count(), 1, 'the saved group leaves Do now (it waits for the importer)');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  assert.ok(sw, 'no horizontal page scroll');
  console.log('r12-fixture: all checks passed');
}
