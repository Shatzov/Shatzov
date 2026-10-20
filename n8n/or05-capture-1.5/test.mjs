// Offline test of BLOCKS-OR-05 capture 1.10 (conversation emails) against capture 1.9.
//   node n8n/or05-capture-1.5/test.mjs
// Loads before.js (capture 1.9 as published) and after.js (1.10 proposed), each in its own VM context exactly as the n8n Code node
// runs it (the node's code as a function body, with $ and $execution stubbed), and compares what each plans for the same synthetic
// mailbox and workbook. All data is synthetic: example.com domains, invented people. Nothing is read or written anywhere.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-10-21T09:00:00.000Z');
const OWNER = 'owner@example.com';

// ---------- loading a Code node ----------
function load(file) {
  const ctx = vm.createContext({ Buffer, console, TextDecoder, TextEncoder, atob, btoa });
  const body = fs.readFileSync(path.join(dir, file), 'utf8');
  // the node's code is a function body (it ends with a top-level return); n8n provides $ and $execution
  const fn = vm.runInContext('(function ($, $execution, $workflow) {\n' + body + '\n})', ctx, { filename: file });
  return { ctx, fn };
}
// run the whole node with stubbed inputs; returns the node's output items and the module it defined
function runNode(file, tabs, messages, cfg) {
  const { ctx, fn } = load(file);
  const items = (rows) => rows.map((json) => ({ json }));
  const nodes = {
    'Read Config': items(Object.entries(cfg).map(([key, value]) => ({ key, value }))),
    'Read Contacts': items(tabs.Contacts || []), 'Read Queue': items(tabs.Queue || []), 'Read Activity': items(tabs.Activity || []),
    'Read Suppression': items(tabs.Suppression || []), 'Read Mail_Events': items(tabs.Mail_Events || []), 'Read Research': items(tabs.Research || []),
    'Config': items([{ source: 'fixture' }]), 'Normalize Messages': items(messages),
  };
  const $ = (n) => { if (!(n in nodes)) return { isExecuted: false, all: () => { throw new Error(n + ' did not run'); }, first: () => { throw new Error(n + ' did not run'); } };
    return { isExecuted: true, all: () => nodes[n], first: () => nodes[n][0] }; };
  const out = fn($, { id: 'test-run' }, { id: 'test' });
  return { out, mod: ctx.BlocksCapture };
}
const before = load('before.js'); const after = load('after.js');
// the module alone (the glue at the end of the node needs n8n inputs; run it with empty ones to define the modules)
function moduleOf(file) { return runNode(file, {}, [], { sender_address: OWNER }).mod; }
const B = moduleOf('before.js'), A = moduleOf('after.js');
assert.equal(B.VERSION, '1.9'); assert.equal(A.VERSION, '1.10');
void before; void after;

// ---------- synthetic workbook ----------
const firm = (n) => 'firm' + n + '.example.com';
const person = (n, name, pid) => ({ contact_key: firm(n) + ' | ' + name, domain: firm(n), apollo_person_id: pid || 'pid' + n, full_name: name, email: name.split(' ')[0].toLowerCase() + '@' + firm(n), country: 'United States', city: 'Boston', state: 'Massachusetts' });
const P = {
  meet: person(1, 'Avery Sample'),        // replied, meeting booked: the case to automate
  cold: person(2, 'Blake Sample'),        // E1 sent, no reaction
  opt: person(3, 'Casey Sample'),         // replied and met, then opted out
  sup: person(4, 'Drew Sample'),          // meeting, but an email Suppression row
  cancel: person(5, 'Emery Sample'),      // a meeting that was cancelled, nothing else
  stage: person(6, 'Finley Sample'),      // no jobs at all; Research partner_stage Meeting held
  open: person(7, 'Gray Sample'),         // replied, but the gate has not blocked the follow-ups
  colleague: person(1, 'Harper Sample', 'pid1b'),  // a cold colleague at firm 1 with an unsent Email 1
};
const job = (p, step, status, subject, content, extra) => Object.assign({ job_key: p.apollo_person_id + '-' + step, company_key: p.domain, contact_key: p.contact_key, apollo_person_id: p.apollo_person_id,
  step, channel: 'email', to: p.email, subject, content, status, sent_at: '', provider_message_id: '' }, extra || {});
const E1TEXT = (p) => 'Hello ' + p.full_name.split(' ')[0] + ', we build service agents for distributors and would like to explore a referral partnership with your team this quarter.';
const FUTEXT = (p, k) => 'Following up ' + k + ' on my note about a referral partnership: would a short call next week be useful for you and the team?';
function seq(p, fuStatus) {
  return [job(p, 'E1', 'sent', 'Partnership idea', E1TEXT(p), { sent_at: '2026-10-01T14:00:00.000Z', provider_message_id: 'e1-' + p.apollo_person_id }),
    job(p, 'FU1', fuStatus, 'Re: Partnership idea', FUTEXT(p, 'once')), job(p, 'FU2', fuStatus, 'Re: Partnership idea', FUTEXT(p, 'twice')), job(p, 'FU3', fuStatus, 'Last note on the partnership', FUTEXT(p, 'a last time'))];
}
let n = 0;
const act = (p, outcome, extra) => Object.assign({ activity_id: 'a' + (++n), ts: '2026-10-0' + Math.min(9, 2 + (n % 7)) + 'T15:00:00.000Z', company_key: p.domain, contact_key: p.contact_key, apollo_person_id: p.apollo_person_id,
  channel: 'email', direction: /^replied/.test(outcome) ? 'in' : '', step: '', job_key: '', outcome, notes: '', logged_by: 'desk', action: outcome, link_id: '' }, extra || {});
function workbook() {
  n = 0;
  const people = Object.values(P);
  return {
    Contacts: people,
    Queue: [...seq(P.meet, 'blocked'), ...seq(P.cold, 'blocked'), ...seq(P.opt, 'blocked'), ...seq(P.sup, 'blocked'), ...seq(P.cancel, 'blocked'), ...seq(P.open, 'approved_pending_send'),
      job(P.colleague, 'E1', 'approved_pending_send', 'Partnership idea for your team', E1TEXT(P.colleague)),
      job(P.stage, 'E1', 'sent', 'Partnership idea', E1TEXT(P.stage), { sent_at: '2026-10-01T14:00:00.000Z', provider_message_id: 'e1-pid6' })],
    Activity: [
      act(P.meet, 'replied_positive'), act(P.meet, 'meeting_booked', { channel: 'meeting', link_id: 'M-1' }),
      act(P.opt, 'replied_positive'), act(P.opt, 'meeting_booked', { channel: 'meeting', link_id: 'M-3' }), act(P.opt, 'opt_out', { action: 'opt_out' }),
      act(P.sup, 'meeting_booked', { channel: 'meeting', link_id: 'M-4' }),
      act(P.cancel, 'meeting_booked', { channel: 'meeting', link_id: 'M-5', ts: '2026-10-03T10:00:00.000Z' }), act(P.cancel, 'meeting_cancelled', { channel: 'meeting', action: 'meeting_outcome', link_id: 'M-5', ts: '2026-10-08T10:00:00.000Z' }),
      act(P.open, 'replied_neutral'),
    ],
    Suppression: [{ scope: 'contact', company_key: P.sup.domain, contact_key: P.sup.contact_key, apollo_person_id: P.sup.apollo_person_id, channel: 'email', status: 'suppressed', reason: 'synthetic', cleared_at: '', row_key: 'sup-4' },
      { scope: 'contact', company_key: P.cold.domain, contact_key: P.cold.contact_key, apollo_person_id: P.cold.apollo_person_id, channel: 'phone', status: 'suppressed', reason: 'synthetic phone listing', cleared_at: '', row_key: 'dnc-2' }],
    Mail_Events: [],
    Research: [{ company_key: firm(1), partner_stage: 'Meeting booked', outreach_eligibility: 'eligible' }, { company_key: firm(6), partner_stage: 'Meeting held', outreach_eligibility: 'eligible' },
      { company_key: firm(5), partner_stage: 'Conversation', outreach_eligibility: 'eligible' }],
  };
}
const CFG = { sender_address: OWNER };
let mid = 0;
const handSent = (to, subject, text, extra) => Object.assign({ message_id: 'm' + (++mid).toString(16).padStart(6, '0'), thread_id: 't' + mid, from: 'Owner <' + OWNER + '>', to, date: '2026-10-20T16:00:00.000Z',
  subject, text, headers: { 'message-id': '<hand' + mid + '@example.com>' } }, extra || {});
const POST = 'Thank you for the time today. As promised, here is the summary of what we discussed and the two dates that work for the follow-up session with your technical lead.';

// ---------- helpers ----------
const plain = (x) => JSON.parse(JSON.stringify(x));   // each file runs in its own VM realm: compare plain data
const plan = (M, msgs, tabs) => plain(M.capture(msgs, tabs || workbook(), CFG, NOW, 'run-1'));
const one = (M, msg, tabs) => { const p = plan(M, [msg], tabs); return { p, ev: p.mailEvents[0] || null, act: p.activity, queue: p.queue, sup: p.suppression }; };
const same = (msg, label, tabs) => {   // the proposed capture plans exactly what the published one plans
  const b = plan(B, [msg], tabs), a = plan(A, [msg], tabs);
  assert.deepEqual(a, b, label + ': 1.10 differs from 1.9'); return a;
};
const results = []; const ok = (name, detail) => { results.push(name); console.log('PASS', name, detail ? '- ' + detail : ''); };

// (a) hand-sent email to a meeting-stage contact: recorded automatically as a conversation email
{
  const msg = handSent(P.meet.email, 'Summary of today and next session', POST);
  const b = one(B, msg), a = one(A, msg);
  assert.equal(b.ev.classification, 'manual_sent'); assert.equal(b.ev.status, 'review'); assert.match(b.ev.reason, /no unsent job has this subject/); assert.equal(b.act.length, 0);
  assert.equal(a.ev.classification, 'conversation_sent'); assert.equal(a.ev.status, 'applied'); assert.equal(a.ev.confidence, 'high');
  assert.equal(a.ev.activity_id, 'm' + msg.message_id); assert.equal(a.ev.job_key, ''); assert.equal(a.ev.contact_key, P.meet.contact_key);
  assert.equal(a.act.length, 1); const r = a.act[0];
  const want = { activity_id: 'm' + msg.message_id, ts: msg.date, company_key: P.meet.domain, contact_key: P.meet.contact_key, apollo_person_id: P.meet.apollo_person_id,
    channel: 'email', direction: 'out', step: '', job_key: '', outcome: 'sent', action: 'mail_review', provider_message_id: msg.message_id, to: P.meet.email,
    next_action: '', next_action_date: '', next_owner: '', link_id: '', logged_by: 'capture' };
  for (const [k, v] of Object.entries(want)) assert.equal(r[k], v, 'Activity.' + k);
  assert.match(r.notes, /^conversation email outside the sequence "Summary of today and next session" \(mailbox event m[0-9a-f]+\)\. recorded by the mailbox capture 1\.10, person level: their /);
  assert.equal(a.queue.length, 0, 'no Queue row is touched'); assert.equal(a.sup.length, 0);
  assert.equal(a.p.regate, true, 'the gate runs again (an outcome sent was written)');
  ok('(a) meeting-stage contact -> conversation_sent applied', a.ev.reason.slice(0, 150) + '...');
}
// (b) the same email with the subject of an unsent follow-up: unchanged (a review item that holds the person)
{
  const msg = handSent(P.meet.email, 'Re: Partnership idea', POST);
  const a = same(msg, '(b)'); assert.equal(a.mailEvents[0].classification, 'manual_sent'); assert.equal(a.mailEvents[0].status, 'review'); assert.match(a.mailEvents[0].reason, /with the subject of FU1/);
  ok('(b) subject of an unsent job -> unchanged', a.mailEvents[0].reason.slice(0, 110) + '...');
  const msg2 = handSent(P.meet.email, 'A different subject', 'Hi Avery,\n' + FUTEXT(P.meet, 'once') + '\nBest');   // the full text of FU1 under another subject
  const a2 = same(msg2, '(b2)'); assert.equal(a2.mailEvents[0].status, 'review'); assert.match(a2.mailEvents[0].reason, /is not that job's subject/);
  ok('(b2) full text of an unsent job under another subject -> unchanged', a2.mailEvents[0].reason.slice(0, 110) + '...');
  const msg3 = handSent(P.meet.email, 'Checking in', 'Following up on my note about a referral partnership: would a short call next week be useful for the team?');   // a rewritten step
  const a3 = same(msg3, '(b3)'); assert.equal(a3.mailEvents[0].status, 'review');
  ok('(b3) most of a job\'s text (a rewritten step) -> unchanged');
}
// (c) hand-sent email to a contact with no conversation: unchanged
{
  const msg = handSent(P.cold.email, 'Quick question', POST);
  const a = same(msg, '(c)'); assert.equal(a.mailEvents[0].classification, 'manual_sent'); assert.equal(a.mailEvents[0].status, 'review');
  ok('(c) no conversation on record -> manual_sent review as before');
}
// (d) opted-out contact and suppressed contact: unchanged
{
  const a = same(handSent(P.opt.email, 'Summary of today', POST), '(d1)'); assert.equal(a.mailEvents[0].status, 'review');
  const b = same(handSent(P.sup.email, 'Summary of today', POST), '(d2)'); assert.equal(b.mailEvents[0].status, 'review');
  const tabs = workbook(); tabs.Suppression.push({ scope: 'account', company_key: firm(1), contact_key: '', apollo_person_id: '', channel: 'all', status: 'hold_conflict', reason: 'synthetic', cleared_at: '', row_key: 'acct-1' });
  const c = same(handSent(P.meet.email, 'Summary of today', POST), '(d3)', tabs); assert.equal(c.mailEvents[0].status, 'review');
  const t2 = workbook(); t2.Research[0].outreach_eligibility = 'hold_overlap';
  const d = same(handSent(P.meet.email, 'Summary of today', POST), '(d4)', t2); assert.equal(d.mailEvents[0].status, 'review');
  ok('(d) opt-out, contact suppression, account suppression, ineligible account -> unchanged');
}
// (e) a cancelled meeting only: unchanged (even with Research partner_stage Conversation, while unsent jobs exist)
{
  const a = same(handSent(P.cancel.email, 'Sorry we could not meet', POST), '(e)'); assert.equal(a.mailEvents[0].status, 'review'); assert.equal(a.mailEvents[0].classification, 'manual_sent');
  ok('(e) cancelled meeting only -> unchanged');
}
// further guards
{
  const a = same(handSent(P.open.email, 'Answering your question', POST), '(f)'); assert.equal(a.mailEvents[0].status, 'review');
  ok('(f) replied but follow-ups not blocked by the gate -> unchanged');
  const b = same(handSent(P.meet.email + ', ' + P.colleague.email, 'Summary of today', POST), '(g)'); assert.equal(b.mailEvents[0].status, 'review');
  ok('(g) a cold colleague with an unsent Email 1 among the recipients -> unchanged');
  const inbound = { message_id: 'in1', thread_id: 'tin1', from: P.meet.full_name + ' <' + P.meet.email + '>', to: OWNER, date: '2026-10-20T17:00:00.000Z', subject: 'Re: Summary', text: 'Thanks, both dates work.', headers: {} };
  const c = same(inbound, '(h)'); assert.equal(c.mailEvents[0].classification, 'unlinked_inbound'); assert.equal(c.mailEvents[0].status, 'review');
  ok('(h) inbound reply outside a tracked thread -> unlinked_inbound review, unchanged');
  const t3 = workbook(); t3.Activity.push(act(P.meet, 'entered_by_mistake', { link_id: 'a1' }), act(P.meet, 'meeting_cancelled', { link_id: 'M-1', ts: '2026-10-19T10:00:00.000Z' }));
  const d = same(handSent(P.meet.email, 'Summary of today', POST), '(i)', t3); assert.equal(d.mailEvents[0].status, 'review');
  ok('(i) reply voided by entered_by_mistake and the meeting cancelled -> unchanged');
}
// no unsent job: account-level evidence (Research partner_stage) turns outbound_other review into a conversation email
{
  const msg = handSent(P.stage.email, 'Materials from the meeting', POST);
  const b = one(B, msg), a = one(A, msg);
  assert.equal(b.ev.classification, 'outbound_other'); assert.equal(b.ev.status, 'review');
  assert.equal(a.ev.classification, 'conversation_sent'); assert.equal(a.ev.status, 'applied'); assert.match(a.ev.reason, /Research partner_stage Meeting held/);
  const t = workbook(); t.Research[1].partner_stage = 'Contacted';
  const c = same(handSent(P.stage.email, 'Materials', POST), '(j2)', t); assert.equal(c.mailEvents[0].classification, 'outbound_other');
  ok('(j) no unsent job, Research partner_stage Meeting held -> conversation_sent; Contacted -> unchanged');
}
// 1.9 reconciliation covers the new row: an applied conversation_sent row whose Activity row is missing gets exactly that row
{
  const msg = handSent(P.meet.email, 'Summary of today and next session', POST);
  const t = workbook(); const first = plan(A, [msg], t);
  t.Mail_Events.push(first.mailEvents[0]);   // the index row was written, the run stopped before Activity
  const again = plan(A, [msg], t);
  assert.equal(again.mailEvents.length, 0); assert.equal(again.activity.length, 1); assert.equal(again.activity[0].activity_id, 'm' + msg.message_id);
  assert.equal(again.reconciled[0].result, 'reconciled');
  t.Activity.push(again.activity[0]); const third = plan(A, [msg], t);
  assert.equal(third.activity.length, 0); assert.equal(third.mailEvents.length, 0);
  ok('(k) reconciliation writes the missing Activity row once, then nothing');
}
// the whole node, run as n8n runs it: the glue passes Research to the capture
{
  const msg = handSent(P.stage.email, 'Materials from the meeting', POST);
  const rb = runNode('before.js', workbook(), [msg], CFG).out, ra = runNode('after.js', workbook(), [msg], CFG).out;
  const evB = rb.find(i => i.json.__op === 'mail_event').json.row, evA = ra.find(i => i.json.__op === 'mail_event').json.row;
  assert.equal(evB.classification, 'outbound_other'); assert.equal(evA.classification, 'conversation_sent');
  assert.equal(ra.filter(i => i.json.__op === 'activity').length, 1); assert.equal(rb.filter(i => i.json.__op === 'activity').length, 0);
  assert.deepEqual(Object.keys(evA), plain(A.MAIL_EVENT_COLUMNS), 'the Mail_Events row keeps its 24 columns in order');
  ok('(l) full node run: Research reaches the capture; output items as before plus one Activity row');
}
console.log('\n' + results.length + ' checks passed (capture ' + B.VERSION + ' vs ' + A.VERSION + ')');
