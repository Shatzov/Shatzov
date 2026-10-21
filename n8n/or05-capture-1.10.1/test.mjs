// Offline test of BLOCKS-OR-05 capture 1.10.1 (conversation emails, review noise only) against capture 1.9.
//   node n8n/or05-capture-1.10.1/test.mjs
// Loads before.js (capture 1.9 as published) and after.js (1.10.1 proposed), each in its own VM context exactly as the n8n Code node
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
  const ctx = vm.createContext({ Buffer, console, TextDecoder, TextEncoder, atob, btoa, __BLOCKS_PUBLIC_COPY_OK__: true });   // the public copies refuse to run without this flag
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
assert.equal(B.VERSION, '1.9'); assert.equal(A.VERSION, '1.10.1');
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
  assert.deepEqual(a, b, label + ': 1.10.1 differs from 1.9'); return a;
};
const results = []; const ok = (name, detail) => { results.push(name); console.log('PASS', name, detail ? '- ' + detail : ''); };


// (a) hand-sent email to a person who replied and has a meeting: marked resolved as a conversation email; nothing else is written
{
  const msg = handSent(P.meet.email, 'Summary of today and next session', POST);
  const b = one(B, msg), a = one(A, msg);
  assert.equal(b.ev.classification, 'manual_sent'); assert.equal(b.ev.status, 'review'); assert.equal(b.act.length, 0);
  assert.equal(a.ev.classification, 'conversation_sent'); assert.equal(a.ev.status, 'resolved'); assert.equal(a.ev.confidence, 'high');
  assert.equal(a.ev.activity_id, ''); assert.equal(a.ev.job_key, ''); assert.equal(a.ev.contact_key, P.meet.contact_key);
  assert.equal(a.ev.resolved_by, 'mailbox capture 1.10.1 (conversation email)'); assert.ok(a.ev.resolved_at);
  assert.equal(a.act.length, 0, 'no Activity row'); assert.equal(a.queue.length, 0, 'no Queue row'); assert.equal(a.sup.length, 0, 'no Suppression row');
  assert.equal(a.p.regate, b.p.regate, 'the gate is asked to run exactly when 1.9 asks');
  assert.equal(a.p.reconcile ? a.p.reconcile.length : 0, 0);
  ok('(a) person in conversation -> conversation_sent resolved, no Activity/Queue/Suppression write', a.ev.reason.slice(0, 120) + '...');
}
// (b) anything that can be a sequence step: unchanged
{
  const a = same(handSent(P.meet.email, 'Re: Partnership idea', POST), '(b1)'); assert.match(a.mailEvents[0].reason, /with the subject of FU1/);
  const a2 = same(handSent(P.meet.email, 'A different subject', 'Hi Avery,\n' + FUTEXT(P.meet, 'once') + '\nBest'), '(b2)'); assert.equal(a2.mailEvents[0].status, 'review');
  const a3 = same(handSent(P.meet.email, 'Checking in', 'Following up on my note about a referral partnership: would a short call next week be useful for the team?'), '(b3)'); assert.equal(a3.mailEvents[0].status, 'review');
  ok('(b) subject of an unsent job, its full text, or most of it -> unchanged');
}
// (c)-(i) the 1.10 guards still hold: every one plans exactly what 1.9 plans
{
  same(handSent(P.cold.email, 'Quick question', POST), '(c) no conversation');
  same(handSent(P.opt.email, 'Summary of today', POST), '(d1) opted out after a reply and a meeting');
  same(handSent(P.sup.email, 'Summary of today', POST), '(d2) email suppression');
  const t = workbook(); t.Suppression.push({ scope: 'account', company_key: firm(1), contact_key: '', apollo_person_id: '', channel: 'all', status: 'hold_conflict', reason: 'synthetic', cleared_at: '', row_key: 'acct-1' });
  same(handSent(P.meet.email, 'Summary of today', POST), '(d3) account suppression', t);
  const t2 = workbook(); t2.Research[0].outreach_eligibility = 'hold_overlap'; same(handSent(P.meet.email, 'Summary of today', POST), '(d4) ineligible account', t2);
  const t2b = workbook(); t2b.Research[0].partner_stage = 'Closed'; same(handSent(P.meet.email, 'Summary of today', POST), '(d5) account Closed', t2b);
  same(handSent(P.cancel.email, 'Sorry we could not meet', POST), '(e) cancelled meeting only');
  same(handSent(P.open.email, 'Answering your question', POST), '(f) replied, follow-ups not blocked by the gate');
  same(handSent(P.meet.email + ', ' + P.colleague.email, 'Summary of today', POST), '(g) a cold colleague among the recipients');
  same({ message_id: 'in1', thread_id: 'tin1', from: P.meet.full_name + ' <' + P.meet.email + '>', to: OWNER, date: '2026-10-20T17:00:00.000Z', subject: 'Re: Summary', text: 'Thanks, both dates work.', headers: {} }, '(h) inbound');
  const t3 = workbook(); t3.Activity = t3.Activity.filter(a => !(a.contact_key === P.meet.contact_key && a.outcome === 'meeting_booked'));
  t3.Activity.push(act(P.meet, 'entered_by_mistake', { link_id: 'a1' })); same(handSent(P.meet.email, 'Summary of today', POST), '(i) the only reply voided', t3);
  ok('(c)-(i) no conversation, opt-out, suppressions, ineligible, Closed, cancelled meeting, unblocked follow-ups, cold co-recipient, inbound, voided reply -> unchanged');
}
// (j) account-level evidence alone never counts any more (1.10 accepted it)
{
  same(handSent(P.stage.email, 'Materials from the meeting', POST), '(j1) no jobs, Research partner_stage Meeting held');
  const t = workbook(); const col = person(1, 'Indigo Sample', 'pid1c'); t.Contacts.push(col);
  same(handSent(col.email, 'Introduction from your colleague', POST), '(j2) a colleague of someone who replied, nothing of their own', t);
  ok('(j) Research stage or a colleague\'s conversation alone -> unchanged (review)');
}
// (k) deferrals, declines and pauses: a later ending at the firm wins over an earlier reply or meeting
{
  const t1 = workbook(); t1.Activity.push(act(P.meet, 'connected_no_interest', { channel: 'phone', ts: '2026-10-15T15:00:00.000Z' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k1) the person deferred (no interest for now, check back)', t1);
  const t2 = workbook(); t2.Activity.push(act(P.colleague, 'connected_not_interested', { channel: 'phone', ts: '2026-10-15T15:00:00.000Z' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k2) a colleague declined for the firm after the reply', t2);
  const t3 = workbook(); t3.Activity.push(act(P.meet, 'pause_set', { channel: 'note', ts: '2026-10-15T15:00:00.000Z' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k3) a pause set for the person after the reply', t3);
  const t4 = workbook(); t4.Activity.push(Object.assign(act(P.meet, 'pause_set', { channel: 'note', ts: '2026-10-15T15:00:00.000Z' }), { contact_key: '', apollo_person_id: '' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k4) a firm-wide pause after the reply', t4);
  const t5 = workbook(); t5.Activity.push(act(P.meet, 'agreement_declined', { channel: 'note', ts: '2026-10-15T15:00:00.000Z' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k5) partnership declined', t5);
  const t6 = workbook(); t6.Activity.push(act(P.colleague, 'replied_negative', { ts: '2026-10-15T15:00:00.000Z', direction: 'in' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k6) a colleague answered negatively after the reply', t6);
  const t7 = workbook(); t7.Activity.push(act(P.meet, 'meeting_cancelled', { channel: 'meeting', link_id: 'M-9', ts: '2026-10-15T15:00:00.000Z' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(k7) a meeting cancelled after the reply', t7);
  const t8 = workbook(); t8.Activity.push(act(P.colleague, 'connected_no_interest', { channel: 'phone', ts: '2026-09-20T15:00:00.000Z' }));
  const a8 = one(A, handSent(P.meet.email, 'Summary of today', POST), t8); assert.equal(a8.ev.classification, 'conversation_sent', 'an ending BEFORE the reply does not block');
  ok('(k) deferral, decline, pause (person or firm), declined agreement, negative reply, cancelled meeting after the signal -> unchanged; an older ending does not block');
}
// (l) the signal must be filed under the key the gate uses for this person
{
  const t = workbook(); t.Activity = t.Activity.filter(a => a.contact_key !== P.meet.contact_key);
  t.Activity.push(act(P.meet, 'replied_positive', { apollo_person_id: 'pid-other' }));   // same contact_key, a different person id: the gate files it elsewhere
  same(handSent(P.meet.email, 'Summary of today', POST), '(l) reply filed under another gate key', t);
  ok('(l) a signal the gate files under another key -> unchanged');
}
// (l2) a correction the gate cannot see: a callback request corrected to 'interested' is not a signal; a reply corrected to
// 'not interested' blocks
{
  const t = workbook(); t.Activity = t.Activity.filter(a => a.contact_key !== P.meet.contact_key);
  t.Activity.push(act(P.meet, 'callback_requested', { channel: 'phone', activity_id: 'cb1' }), act(P.meet, 'outcome_corrected', { channel: 'phone', link_id: 'cb1', notes: 'corrected [correct {"outcome":"connected_interested","summary":"x"}]' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(l2a) callback corrected to interested', t);
  const t2 = workbook(); t2.Activity.push(act(P.meet, 'outcome_corrected', { link_id: 'a1', notes: 'corrected [correct {"outcome":"connected_not_interested","summary":"x"}]' }));
  same(handSent(P.meet.email, 'Summary of today', POST), '(l2b) reply corrected to not interested', t2);
  ok('(l2) corrections: only a signal in both the original and the correction counts; a corrected-to-negative blocks');
}
// (m) duplicates and partial failure: one row per message, and nothing to reconcile
{
  const msg = handSent(P.meet.email, 'Summary of today and next session', POST);
  const t = workbook(); const first = plan(A, [msg], t); assert.equal(first.mailEvents.length, 1);
  t.Mail_Events.push(first.mailEvents[0]); const again = plan(A, [msg], t);
  assert.equal(again.mailEvents.length, 0); assert.equal(again.activity.length, 0); assert.equal((again.reconciled || []).length, 0);
  const twice = plan(A, [msg, Object.assign({}, msg)], workbook()); assert.equal(twice.mailEvents.length, 1);
  ok('(m) a second capture of the same message, or the message twice in one batch -> one row, no reconciliation');
}
// (n) the whole node, as n8n runs it
{
  const msg = handSent(P.meet.email, 'Summary of today and next session', POST);
  const rb = runNode('before.js', workbook(), [msg], CFG).out, ra = runNode('after.js', workbook(), [msg], CFG).out;
  const ops = (o) => o.map(i => i.json.__op).filter(Boolean).sort().join(',');
  assert.equal(ops(ra), ops(rb), 'the same kinds of output items as 1.9');
  const evA = ra.find(i => i.json.__op === 'mail_event').json.row; assert.equal(evA.classification, 'conversation_sent'); assert.equal(evA.status, 'resolved');
  assert.deepEqual(Object.keys(evA), plain(A.MAIL_EVENT_COLUMNS), 'the Mail_Events row keeps its columns in order');
  assert.equal(ra.filter(i => i.json.__op === 'activity').length, 0);
  ok('(n) full node run: one Mail_Events row, no Activity row, same output kinds as 1.9', ops(ra));
}
console.log('\n' + results.length + ' checks passed (capture 1.9 vs 1.10.1)');
