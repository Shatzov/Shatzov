/*
 * OR-04 Mail Event Resolutions 1.0 (21 Oct 2026). Sits between "Plan" and the Pick nodes; passes Plan's output on unchanged
 * except for Desk entries with action "mail_event_resolve", which the Plan (desk_log 3.6.2) does not know and rejects as an
 * unknown action. This node decides those entries instead and replaces the Plan's rejection row with its own.
 *
 * What the action does, for a mailbox event the capture matched to NO firm (Mail_Events company_key empty), status review:
 *   resolution "associate": you confirmed whom it concerns. The row gets that firm (and person, if you chose one), status
 *       resolved, resolved_at/by, and an audit note appended to its reason. Its classification is kept.
 *   resolution "ignore": it concerns nobody we track. Status ignored, resolved_at/by, audit note appended. Classification kept.
 *   resolution "reopen": undoes the last associate or ignore made this way (and only that): status back to review, the firm and
 *       person it was given are cleared again, an audit note is appended. Nothing else ever written by these entries exists.
 * Writes: one Mail_Events row per accepted entry (columns named above only) and its Desk_Import row. Never an Activity, Queue,
 * Suppression, Contacts, Research or Config row; never a gate run. Events that already belong to a firm keep using mail_review.
 * Repeats: an event id already imported (Desk_Import accepted or duplicate) is a duplicate and writes nothing. Two entries for one
 * event in the same run are applied in the order they were made. If this node fails for any reason, Plan's output goes on
 * unchanged (the entries stay rejected as an unknown action, nothing is written, and they can be saved again).
 */
const S = v => String(v == null ? '' : v).trim();
const passOn = $input.all().map(i => ({ json: i.json }));
try {
  const ran = n => { try { return $(n).isExecuted; } catch (e) { return false; } };
  if (!ran('Extract Log JSON') || !ran('List Inbox')) return passOn;
  const listed = $('List Inbox').all(), parsed = $('Extract Log JSON').all();
  if (listed.length !== parsed.length) return passOn;
  const files = listed.map((it, i) => ({ file_id: S(it.json.id), name: S(it.json.name), entry: parsed[i] && parsed[i].json && parsed[i].json.entry }))
    .filter(f => f.file_id && /^desk-log_e[a-z0-9]{8,40}\.json$/.test(f.name) && f.entry && typeof f.entry === 'object' && S(f.entry.action) === 'mail_event_resolve' && f.name === 'desk-log_' + S(f.entry.event_id) + '.json')   // the Plan's own file-name rule
    .sort((a, b) => S(a.entry.created_at).localeCompare(S(b.entry.created_at)) || S(a.entry.event_id).localeCompare(S(b.entry.event_id)));
  if (!files.length) return passOn;

  const rows = n => { try { return $(n).all().map(i => i.json).filter(r => r && Object.keys(r).length > 1); } catch (e) { return []; } };
  const mail = {}; for (const m of rows('Read Mail_Events')) if (S(m.message_id)) mail[S(m.message_id)] = Object.assign({}, m);
  const companies = new Set(rows('Read Companies').map(r => S(r.company_key)).filter(Boolean));
  const contacts = {}; for (const c of rows('Read Contacts')) if (S(c.contact_key)) contacts[S(c.contact_key)] = c;
  const done = new Set(rows('Read Desk_Import').filter(r => /^(accepted|duplicate)$/i.test(S(r.status))).map(r => S(r.event_id)));
  const plan = $input.all().map(i => i.json);
  const touchedByPlan = new Set(plan.filter(x => x.__op === 'mail_event').map(x => S(x.row && x.row.message_id)));
  const nowIso = new Date().toISOString();
  const LAST = /\[desk (associated|ignored|reopened) [^\]]*\]\s*$/;
  const decided = [], seenIds = new Set(), writes = [];   // one Desk_Import row per file, as the Plan writes them
  const decide = (id, row) => { decided.push(row); seenIds.add(id); };

  for (const f of files) {
    const e = f.entry, id = S(e.event_id), kind = S(e.resolution), mid = S(e.mail && e.mail.message_id), note = S(e.notes).replace(/[\[\]]/g, '');
    const co = S(e.company_key), ck = S(e.contact_key);
    const base = { event_id: id, file_id: f.file_id, file_name: f.name, imported_at: nowIso, company_key: co, contact_key: ck, action: 'mail_event_resolve', status: '', reason: '', writes: '', activity_id: '' };
    if (done.has(id) || seenIds.has(id)) { decide(id, Object.assign(base, { status: 'duplicate', reason: 'this event id is already imported; nothing is written again' })); continue; }
    const err = [];
    if (e.schema !== 'desk-log/1') err.push('unknown entry format "' + S(e.schema) + '"');
    const m = mail[mid];
    if (m && S(m.reason).includes('by Itamar (Desk ' + id + ')')) {   // an earlier run wrote the row, then stopped before its Desk_Import row
      decide(id, Object.assign(base, { status: 'accepted', reason: 'finished an import that stopped part-way: Mail_Events ' + mid + ' already carries this entry; nothing is written again' }));
      continue;
    }
    if (!mid) err.push('the entry names no mailbox event');
    else if (!m) err.push('mailbox event ' + mid + ' is not in the Mail_Events tab');
    if (!['associate', 'ignore', 'reopen'].includes(kind)) err.push('resolution "' + kind + '" is not one of associate, ignore, reopen');
    if (m && touchedByPlan.has(mid)) err.push('another entry in this import changed the same mailbox event; save this one again if it still applies');
    if (m && (kind === 'associate' || kind === 'ignore')) {
      if (!/^review$/i.test(S(m.status))) err.push('mailbox event ' + mid + ' is already ' + S(m.status));
      if (S(m.company_key)) err.push('mailbox event ' + mid + ' already belongs to ' + S(m.company_key) + '; resolve it with the mailbox form');
    }
    if (kind === 'associate') {
      if (!co || !companies.has(co)) err.push('company_key "' + co + '" is not in the Companies tab');
      if (ck) { const c = contacts[ck]; if (!c) err.push('contact "' + ck + '" is not in Contacts'); else if (S(c.domain) !== co && ck.split(' | ')[0] !== co) err.push('contact "' + ck + '" does not belong to ' + co); }
      if (e.confirmed !== true) err.push('the entry does not say you confirmed whom the event concerns');
      if (note.length < 8) err.push('say how you confirmed whom it concerns (a few words; it stays with the event)');
    }
    if (kind === 'ignore') {
      if (co && co !== '(no firm)') err.push('an ignored event names no firm');
      if (ck) err.push('an ignored event names no person');
      if (note.length < 8) err.push('say why it concerns nobody we track (a few words; it stays with the event)');
    }
    let undo = '';
    if (m && kind === 'reopen') {
      const last = (S(m.reason).match(LAST) || [])[1] || '';
      if (!/^(resolved|ignored)$/i.test(S(m.status)) || !/^(associated|ignored)$/.test(last)) err.push('only an event resolved with "associate" or "ignore" on the Desk can be reopened here; mailbox event ' + mid + ' is ' + (S(m.status) || 'not resolved') + (last ? ' (last: ' + last + ')' : ' by another route'));
      else if (S(m.activity_id)) err.push('mailbox event ' + mid + ' has an Activity row (' + S(m.activity_id) + '); it was not resolved by this action');
      undo = last;
      if (note.length < 3) err.push('say why you reopen it (a few words; it stays with the event)');
    }
    if (err.length) { decide(id, Object.assign(base, { status: 'rejected', reason: err.join('; ') })); continue; }

    const by = 'Itamar (Desk ' + id + ')', stamp = nowIso.slice(0, 16) + 'Z';
    const row = { message_id: mid };
    if (kind === 'associate') {
      const c = ck ? contacts[ck] : null;
      Object.assign(row, { company_key: co, contact_key: ck, apollo_person_id: c ? S(c.apollo_person_id) : '', status: 'resolved', resolved_at: nowIso, resolved_by: by,
        reason: (S(m.reason) + ' [desk associated ' + stamp + ' by ' + by + ' with ' + (ck || co) + ': ' + note + ']').trim() });
    } else if (kind === 'ignore') {
      Object.assign(row, { status: 'ignored', resolved_at: nowIso, resolved_by: by, reason: (S(m.reason) + ' [desk ignored ' + stamp + ' by ' + by + ': ' + note + ']').trim() });
    } else {
      Object.assign(row, { status: 'review', resolved_at: '', resolved_by: '', reason: (S(m.reason) + ' [desk reopened ' + stamp + ' by ' + by + ' (undoes ' + undo + '): ' + note + ']').trim() });
      if (undo === 'associated') Object.assign(row, { company_key: '', contact_key: '', apollo_person_id: '' });
    }
    Object.assign(m, row);
    const prev = writes.find(w => w.message_id === mid); if (prev) Object.assign(prev, row); else writes.push(row);
    decide(id, Object.assign(base, { status: 'accepted', reason: kind === 'associate' ? 'associated with ' + (ck || co) + '; no Activity, Queue or Suppression row' : kind === 'ignore' ? 'ignored; no Activity, Queue or Suppression row' : 'reopened for review (undoes ' + undo + ')', writes: 'Mail_Events ' + mid }));
  }

  const ids = seenIds;
  const blank = { event_id: '', file_id: '', file_name: '', imported_at: '', company_key: '', contact_key: '', action: '', status: '', reason: '', writes: '', activity_id: '' };
  const out = [];
  for (const x of plan) {
    if (x.__op === 'import' && ids.has(S(x.row && x.row.event_id))) continue;   // Plan's "unknown action" rejection, replaced below
    if (x.__op === 'summary') continue;
    out.push(x);
  }
  for (const w of writes) out.push({ __op: 'mail_event', row: w });
  for (const d of decided) out.push({ __op: 'import', row: Object.assign({}, blank, d) });
  const sum = plan.find(x => x.__op === 'summary');
  if (sum) { const r = JSON.parse(JSON.stringify(sum.row)); r.counts = Object.assign({}, r.counts, { mail_events: ((r.counts && r.counts.mail_events) || 0) + writes.length });
    r.mail_event_resolutions = decided.map(d => d.event_id + ' ' + d.status); out.push({ __op: 'summary', row: r }); }
  return out.map(json => ({ json }));
} catch (error) {
  const sum = passOn.find(i => i.json.__op === 'summary');
  if (sum) sum.json = { __op: 'summary', row: Object.assign({}, sum.json.row, { mail_event_resolutions_error: S(error && error.message).slice(0, 200) }) };
  return passOn;
}
