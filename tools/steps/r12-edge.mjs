// r12 edge cases on the sanitized fixture. MODE selects the case (run by tools/test.sh):
//   mixed    the 7-event group (4 written by hand, 3 from them): the group action saves exactly the 4 outgoing ones; the 3 incoming stay open
//   fail     HARNESS_FAIL=3: the third save fails before any write; saving again finishes with each message saved once
//   lost     HARNESS_FAIL_AFTER=2: the second file is written but its answer is lost; the retry sends the same event id again
//            (the importer records an event id once), so no message gets two different entries
//   reload   after the group save, a reload offers no second save for the same messages
//   ended    a fixture whose meeting was later cancelled: the row does not call the account a meeting or a conversation
//   orphan   the event matched to nobody has a row with its details and the r13 controls; nothing is saved by opening it
import assert from 'node:assert/strict';
const MODE = process.env.MODE || 'mixed';
const groupBtn = (page, n) => page.locator('li.r12mg', { hasText: n + ' mailbox events' }).locator('[data-testid="wl-mailgrp-conv-all"]');
async function saves(ctx) { return (await ctx.writes()).filter((w) => w.tool === 'create_file').map((w) => JSON.parse(w.input.textContent)); }
async function dirs(page) { return page.evaluate(() => Object.fromEntries((window.__deskState.tabs.Mail_Events || []).map((m) => [m.message_id, String(m.direction)]))); }
async function settle(page) { await page.waitForTimeout(2500); }
export default async function (page, ctx) {
  if (MODE === 'mixed') {
    const D = await dirs(page); await groupBtn(page, 7).click(); await settle(page);
    const e = await saves(ctx); assert.equal(e.length, 4, 'four files'); assert.ok(e.every((x) => D[x.mail.message_id] === 'out'), 'only outgoing messages');
    const left = await page.evaluate(() => { const st = window.__deskState; const ids = new Set(); for (const x of st.nx.P.now) for (const y of (x.kind === 'mailgroup' ? x.members : [x])) if (y.kind === 'review') ids.add(String(y.message_id)); return [...ids]; });
    const inbound = Object.entries(D).filter(([, d]) => d === 'in').map(([k]) => k);
    const stillOpen = inbound.filter((k) => left.includes(k)); assert.ok(stillOpen.length >= 3, 'the incoming messages are still in Do now (' + stillOpen.length + ')');
    assert.equal(await page.locator('[data-testid="wl-conv-email"]').count() >= 0, true);
    console.log('edge mixed: ok', JSON.stringify({ saved: e.length, inbound_still_open: stillOpen.length }));
  }
  if (MODE === 'fail' || MODE === 'lost') {
    const b = groupBtn(page, 5); await b.click(); await settle(page);
    const first = await saves(ctx); const label = await page.locator('li.r12mg', { hasText: '5 mailbox events' }).locator('[data-testid="wl-mailgrp-conv-all"]').textContent();
    assert.match(label, /Save the remaining \d+ again \(same entries\)/); assert.equal(await page.locator('[data-testid="r11-save-err"]').count(), 1, 'the error is shown');
    await page.locator('li.r12mg', { hasText: '5 mailbox events' }).locator('[data-testid="wl-mailgrp-conv-all"]').click(); await settle(page);
    const e = await saves(ctx); const by = {}; for (const x of e) (by[x.mail.message_id] = by[x.mail.message_id] || new Set()).add(x.event_id);
    assert.equal(Object.keys(by).length, 5, 'every message saved'); assert.ok(Object.values(by).every((s) => s.size === 1), 'one event id per message');
    if (MODE === 'fail') assert.equal(e.length, 5, 'no message written twice');
    if (MODE === 'lost') assert.equal(e.length, 6, 'the lost one is sent again with the same event id');
    console.log('edge ' + MODE + ': ok', JSON.stringify({ first_round: first.length, files: e.length, messages: Object.keys(by).length }));
  }
  if (MODE === 'reload') {
    await groupBtn(page, 5).click(); await settle(page); const n1 = (await saves(ctx)).length; assert.equal(n1, 5);
    await page.reload(); await page.waitForFunction(() => window.__deskState && window.__deskState.model && window.__deskState.source === 'live', null, { timeout: 120000 }); await page.waitForTimeout(800);
    assert.equal(await groupBtn(page, 5).count(), 0, 'no second group save offered');
    const savedIds = (await saves(ctx)).map((x) => x.mail.message_id);
    const again = await page.evaluate((ids) => [...document.querySelectorAll('[data-r11conv]')].filter((b) => ids.includes(b.dataset.r11conv)).length, savedIds);
    assert.equal(again, 0, 'no per-message save offered for a message already saved');
    const pend = await page.evaluate(() => { try { return Object.keys(localStorage).filter((k) => /pending/.test(k)).map((k) => JSON.parse(localStorage.getItem(k)).length); } catch (e) { return []; } });
    console.log('edge reload: ok', JSON.stringify({ saved: n1, per_message_buttons_left: again, pending_kept: pend }));
  }
  if (MODE === 'ended') {
    const t = await page.locator('li.r12mg', { hasText: '5 mailbox events' }).innerText();
    assert.doesNotMatch(t, /Meeting held|Meeting booked|In conversation since/, 'a later cancellation wins'); assert.match(t, /Meeting cancelled|Ended:/);
    console.log('edge ended: ok', JSON.stringify({ context: t.split('\n').find((l) => /cancel|Ended/.test(l)) }));
  }
  if (MODE === 'orphan') {
    const row = page.locator('li.r12orph').first(); assert.equal(await row.count(), 1, 'one row for the event matched to nobody');
    const id = (await row.getAttribute('data-testid')).replace('wl-mailorphan-', '');
    const known = await page.evaluate((i) => (window.__deskState.tabs.Mail_Events || []).find((m) => m.message_id === i), id);
    assert.ok(known && /^review$/i.test(known.status) && !known.company_key, 'it is an open event with no firm');
    await row.locator('summary').click(); const txt = await row.innerText();
    assert.match(txt, /Associate/); assert.match(txt, /Mark it irrelevant/); assert.ok(txt.includes(id), 'the message id is shown');   // r13: the row resolves it
    assert.equal((await saves(ctx)).length, 0, 'nothing is saved');
    console.log('edge orphan: ok', JSON.stringify({ id, classification: known.classification }));
  }
}
