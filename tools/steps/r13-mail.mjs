// r13: resolving a mailbox event matched to no firm, on the sanitized fixture. MODE selects the case (run by tools/test.sh):
//   form      the row offers Associate and Mark it irrelevant; nothing is saved without a firm, a confirmation and a note; the person
//             list holds only the chosen firm's people; Associate saves exactly one entry, then the row waits for the importer
//   ignore    Mark it irrelevant saves one entry naming no firm and no person
//   fail      HARNESS_FAIL=1: the save fails before any write; the error is shown; saving again writes one file
//   lost      HARNESS_FAIL_AFTER=1: the file is written but the answer is lost; the retry sends the same event id (recorded once)
//   reload    after a save, a reload shows the row waiting, with no second form; "Save again" resends the same entry
//   rejected  an entry the importer refused shows its reason and the form again (fixture-r13: Desk_Import row for erejectr13test1)
//   reopen    Settings lists an event resolved here (fixture-r13) and saves a reopen entry only with a reason
import assert from 'node:assert/strict';
const MODE = process.env.MODE || 'form';
const MID = '1a1400c258b96430';
async function saves(ctx) { return (await ctx.writes()).filter((w) => w.tool === 'create_file').map((w) => JSON.parse(w.input.textContent)); }
const settle = (page) => page.waitForTimeout(1500);
const row = (page) => page.locator('[data-testid="wl-mailorphan-' + MID + '"]');
async function fillAssociate(page, opts = {}) {
  const r = row(page);
  await r.locator('[data-testid="r13-firm"]').selectOption(opts.firm || 'firm02.example');
  if (opts.person !== '') await r.locator('[data-testid="r13-person"]').selectOption(opts.person || 'firm02.example | Person 03');
  await r.locator('[data-testid="r13-note"]').fill(opts.note == null ? 'the bounced address is in his signature' : opts.note);
  if (opts.confirm !== false) await r.locator('[data-testid="r13-confirm"]').check();
}
export default async function (page, ctx) {
  if (MODE === 'form') {
    const r = row(page); assert.equal(await r.count(), 1);
    await r.locator('[data-testid="r13-associate"]').click(); await settle(page);
    assert.match(await r.locator('[data-testid="r13-err"]').innerText(), /choose the firm it concerns/); assert.equal((await saves(ctx)).length, 0);
    await r.locator('[data-testid="r13-firm"]').selectOption('firm02.example');
    const people = await r.locator('[data-testid="r13-person"] option').allTextContents();
    assert.deepEqual(people.slice(1).sort(), ['Person 03', 'Person 04'], 'only the chosen firm\'s people: ' + people.join(', '));
    await fillAssociate(page, { confirm: false }); await r.locator('[data-testid="r13-associate"]').click(); await settle(page);
    assert.match(await r.locator('[data-testid="r13-err"]').innerText(), /tick that you confirmed/); assert.equal((await saves(ctx)).length, 0);
    await fillAssociate(page, { note: 'ok' }); await r.locator('[data-testid="r13-associate"]').click(); await settle(page);
    assert.match(await r.locator('[data-testid="r13-err"]').innerText(), /say how you confirmed it/); assert.equal((await saves(ctx)).length, 0);
    await fillAssociate(page); await r.locator('[data-testid="r13-associate"]').click(); await settle(page);
    const e = await saves(ctx); assert.equal(e.length, 1);
    assert.deepEqual({ schema: e[0].schema, action: e[0].action, resolution: e[0].resolution, company_key: e[0].company_key, contact_key: e[0].contact_key, outcome: e[0].outcome, confirmed: e[0].confirmed, message_id: e[0].mail.message_id },
      { schema: 'desk-log/1', action: 'mail_event_resolve', resolution: 'associate', company_key: 'firm02.example', contact_key: 'firm02.example | Person 03', outcome: 'associated', confirmed: true, message_id: MID });
    assert.match(e[0].event_id, /^e[a-z0-9]{8,40}$/); assert.ok(!('job_key' in e[0]) && !('next_action' in e[0]), 'no job, no next step');
    assert.equal(await row(page).locator('[data-testid="r13-wait"]').count(), 1, 'the row now waits for the importer');
    assert.equal(await row(page).locator('[data-testid="r13-associate"]').count(), 0, 'no second form while it waits');
    console.log('r13 form: ok', JSON.stringify({ saved: e.length, event_id: e[0].event_id }));
  }
  if (MODE === 'ignore') {
    const r = row(page); await r.locator('[data-testid="r13-ignore"]').click(); await settle(page);
    assert.match(await r.locator('[data-testid="r13-err"]').innerText(), /say why it concerns nobody/); assert.equal((await saves(ctx)).length, 0);
    await r.locator('[data-testid="r13-inote"]').fill('a bounce for an address we never wrote to'); await r.locator('[data-testid="r13-ignore"]').click(); await settle(page);
    const e = await saves(ctx); assert.equal(e.length, 1);
    assert.equal(e[0].resolution, 'ignore'); assert.equal(e[0].company_key, '(no firm)'); assert.equal(e[0].contact_key, ''); assert.equal(e[0].confirmed, false); assert.equal(e[0].outcome, 'ignored');
    console.log('r13 ignore: ok', JSON.stringify({ company_key: e[0].company_key }));
  }
  if (MODE === 'fail' || MODE === 'lost') {
    await fillAssociate(page); await row(page).locator('[data-testid="r13-associate"]').click(); await settle(page);
    const first = await saves(ctx); assert.equal(await page.locator('[data-testid="r11-save-err"]').count(), 1, 'the error is shown');
    await fillAssociate(page); await row(page).locator('[data-testid="r13-associate"]').click(); await settle(page);
    const e = await saves(ctx); const ids = new Set(e.map((x) => x.event_id));
    assert.equal(ids.size, 1, 'one event id'); assert.equal(e.length, MODE === 'fail' ? 1 : 2, MODE === 'fail' ? 'written once' : 'the lost one is sent again with the same event id');
    console.log('r13 ' + MODE + ': ok', JSON.stringify({ first_round: first.length, files: e.length, event_ids: ids.size }));
  }
  if (MODE === 'reload') {
    await fillAssociate(page); await row(page).locator('[data-testid="r13-associate"]').click(); await settle(page);
    const id = (await saves(ctx))[0].event_id;
    await page.reload(); await page.waitForFunction(() => window.__deskState && window.__deskState.model && window.__deskState.source === 'live', null, { timeout: 120000 }); await page.waitForTimeout(800);
    assert.equal(await row(page).locator('[data-testid="r13-wait"]').count(), 1, 'still waiting after a reload');
    assert.equal(await row(page).locator('[data-testid="r13-associate"]').count(), 0);
    await row(page).locator('[data-r13resend]').click(); await settle(page);
    const e = await saves(ctx); const last = e[e.length - 1]; assert.ok(e.length >= 1); assert.equal(last.event_id, id, 'the same entry again');   // the harness may restart its capture on reload
    console.log('r13 reload: ok', JSON.stringify({ files: e.length, same_id: last.event_id === id }));
  }
  if (MODE === 'rejected') {
    const key = await page.evaluate(() => Object.keys(localStorage).find((k) => /^blocks_desk_pending_v1:/.test(k)) || null);
    const pkey = key || await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /pending/.test(x)); return k; });
    const entry = { schema: 'desk-log/1', event_id: 'erejectr13test1', created_at: '2026-10-20T20:30:00.000Z', action: 'mail_event_resolve', resolution: 'associate', company_key: 'firm02.example', contact_key: '', channel: 'email', outcome: 'associated', ts: '2026-10-20T20:30:00.000Z', notes: 'test', confirmed: true, mail: { message_id: MID, thread_id: MID } };
    await page.evaluate(([k, en]) => { const kk = k || Object.keys(localStorage).find((x) => /pending/.test(x)) || 'blocks_desk_pending_v1:none'; localStorage.setItem(kk, JSON.stringify([{ event_id: en.event_id, saved_at: '2026-10-20T20:30:00.000Z', file_id: 'f', company_key: en.company_key, contact_key: '', action: en.action, entry: en, item: 'mailorphan:' + en.mail.message_id }])); }, [pkey, entry]);
    if (!pkey) { await fillAssociate(page); }   // no key yet: a first save creates it (not needed when the page already stored one)
    await page.reload(); await page.waitForFunction(() => window.__deskState && window.__deskState.model && window.__deskState.source === 'live', null, { timeout: 120000 }); await page.waitForTimeout(800);
    const t = await row(page).locator('[data-testid="r13-rejected"]').innerText();
    assert.match(t, /Not applied: .*say how you confirmed whom it concerns/); assert.equal(await row(page).locator('[data-testid="r13-associate"]').count(), 1, 'the form is offered again');
    console.log('r13 rejected: ok', JSON.stringify({ shown: t.slice(0, 80) }));
  }
  if (MODE === 'reopen') {
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="settings-open"]')]; (b.find((x) => x.onclick) || b[0]).click(); }); await page.waitForTimeout(800);
    const li = page.locator('[data-testid="r13-reopen-1a1455c3a30fdbc3"]'); assert.equal(await li.count(), 1, 'the event resolved here is listed');
    assert.match(await li.innerText(), /Marked irrelevant/);
    await li.locator('[data-testid="r13-reopen"]').click(); await settle(page); assert.equal((await saves(ctx)).length, 0, 'no reason, nothing saved');
    await li.locator('input[data-r13="rnote"]').fill('it was ours after all'); await li.locator('[data-testid="r13-reopen"]').click(); await settle(page);
    const e = await saves(ctx); assert.equal(e.length, 1); assert.equal(e[0].resolution, 'reopen'); assert.equal(e[0].mail.message_id, '1a1455c3a30fdbc3'); assert.equal(e[0].company_key, '(no firm)');
    assert.equal(await page.locator('[data-testid="r13-reopen-1a11cec737aab9ce"]').count(), 0, 'events ignored by the capture are not offered');
    console.log('r13 reopen: ok', JSON.stringify({ resolution: e[0].resolution }));
  }
}
