// BLOCKS-OR-05 v2 | Capture Mailbox (n8n workflow 0dbM37DbT0GTUgDT), Code node "Capture": capture 1.10 proposed (after).
// Public copy for review. Literals that name people or the mailbox domain are replaced by placeholders, so this file is the
// node's logic but NOT the text to paste into n8n: OWNER_NAME, OWNER, OWNER_SURNAME, owner_first, owner_last stand for the
// mailbox owner's name (in comments, a default sender name, a next_owner value and a greeting pattern), example.com for the
// mailbox domain, and "a contact's" for a prospect named in a changelog comment. Install from the private export (INSTALL.md).
// BLOCKS schedule engine, version 1.3 (29 Sep 2026, release 1007: the backup's start. When the account-level transition (backup.js,
// f.transition) says the backup has taken over or is waiting for its date, a backup with no start of its own is planned from that
// start; a manual switch (Activity backup_switched with next_action_date) is the backup's own start. The gate's "automatic
// continuation from ..." hold is shown as a prerequisite (planned, never due before it), like "waits for Email 1". firmsFromTabs
// computes the transition when Research is passed, so the sender plans exactly what the Desk shows. Version 1.2 (30 Sep 2026; 1.2: a hold always wins. A person or firm pause and a callback hold apply to
// every unsent step, an exact reschedule included: moving a step is never permission to resume. A step moved to a time inside a
// hold goes at the first window after the hold; with no hold, an exact time (a weekend, outside the window) stands as set. The
// callback hold lasts until you log that callback's outcome (an entry linked to it, link_id = the callback's activity_id), set a
// new callback time, or resume the person; an unrelated later phone row never completes it. A linked no-answer or voicemail ends
// the hold with that day (the rest continues the next business day); a linked conversation stops the sequence. 1.1, 29 Sep 2026; the coordinated sequence. Calls are steps of their own (C1, C2), each
// following the email before it by one business day and keeping its gap after the previous call; a call not made before the next
// email goes out is "missed" (no touch recorded) and the next call takes over, while emails never wait for a call and never
// mention one; a conversation on the phone (connected_*) stops the automatic sequence like a reply; a callback request holds the
// person's automatic touches until the end of the callback day, then the rest continues with its spacing; "not interested" is
// told apart from an opt-out. 1.0, 28 Sep 2026:) ONE implementation of the effective schedule, used by the Partner Desk
// (desk_core 1.7 delegates to it) and by BLOCKS-OR-03 (the sender plans from the same function, so a send can never happen
// at a time the Desk would not show). Pure: reads Queue jobs, Activity rows, Contacts locations and Config; writes nothing.
//   Anchor. Email 1 unsent: the first contact window on or after the start (Config program_start, a company or contact start
//   override, latest wins), never reset by a refresh. Email 1 sent: the actual send. Each contact's follow-up clock starts
//   from their actual first send.
//   Spacing. A follow-up is Email 1's anchor day + its day_offset, and never earlier than its gap after the email before it
//   (that email's actual send day, or its own effective day while unsent), so a late send pushes what depends on it. An unsent
//   prerequisite keeps the step "planned", never "due": the sender can never send two emails of one sequence in one run.
//   Overrides. touch_reschedule (a day, or an exact instant) moves one step; an explicit override on a later step stands even
//   when an earlier step moves. schedule_set pause_set holds a person or firm until a time; resumed lifts it.
//   Weekends move to Monday; an explicit instant on a weekend or outside the window stands with a warning. DST is handled by
//   computing every instant from the wall time in the contact's zone on that date.
//   Stops: a reply or meeting stops every unsent touch to the person (gate R5), an opt-out every channel, a bounce email only;
//   Suppression and gate hard blocks always win, and no change of date clears any of them.
//   Sender rule (sendableNow): an email step is sendable only while it is "due" and the clock is inside its effective window;
//   a step whose window has passed rolls to the next weekday window (it is never sent at an odd hour), and a person gets at
//   most one email per run because every later email step stays "planned" until the previous one is actually sent.
if (!globalThis.__BLOCKS_PUBLIC_COPY_OK__) throw new Error('PUBLIC REVIEW COPY of the OR-05 Capture code, with placeholders in place of names and the mailbox domain: do not install it. Paste the private file OR-05.Capture.1.10.1.js.txt from the private backups instead.');
(function (root) {
  'use strict';
  const s = (v) => String(v == null ? '' : v).trim();
  const WITHHELD = '[withheld]';
  function toDate(v) {
    const t = s(v); if (!t || t === WITHHELD) return null;
    if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Math.round((parseFloat(t) - 25569) * 86400000));
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T12:00:00Z' : t); return isNaN(d.getTime()) ? null : d;
  }
  const IL = 'Asia/Jerusalem';
  function ilDay(d) { if (!d) return ''; try { return new Intl.DateTimeFormat('en-CA', { timeZone: IL, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (e) { return d.toISOString().slice(0, 10); } }
  // ---------- 1.5: time zones, windows and the per-person cadence ----------
  const US_TZ = { Alabama: 'America/Chicago', Alaska: 'America/Anchorage', Arizona: 'America/Phoenix', Arkansas: 'America/Chicago', California: 'America/Los_Angeles', Colorado: 'America/Denver', Connecticut: 'America/New_York', Delaware: 'America/New_York', 'District of Columbia': 'America/New_York',
    Florida: 'America/New_York', Georgia: 'America/New_York', Hawaii: 'Pacific/Honolulu', Idaho: 'America/Boise', Illinois: 'America/Chicago', Indiana: 'America/Indiana/Indianapolis', Iowa: 'America/Chicago', Kansas: 'America/Chicago', Kentucky: 'America/New_York', Louisiana: 'America/Chicago',
    Maine: 'America/New_York', Maryland: 'America/New_York', Massachusetts: 'America/New_York', Michigan: 'America/Detroit', Minnesota: 'America/Chicago', Mississippi: 'America/Chicago', Missouri: 'America/Chicago', Montana: 'America/Denver', Nebraska: 'America/Chicago', Nevada: 'America/Los_Angeles',
    'New Hampshire': 'America/New_York', 'New Jersey': 'America/New_York', 'New Mexico': 'America/Denver', 'New York': 'America/New_York', 'North Carolina': 'America/New_York', 'North Dakota': 'America/Chicago', Ohio: 'America/New_York', Oklahoma: 'America/Chicago', Oregon: 'America/Los_Angeles',
    Pennsylvania: 'America/New_York', 'Rhode Island': 'America/New_York', 'South Carolina': 'America/New_York', 'South Dakota': 'America/Chicago', Tennessee: 'America/Chicago', Texas: 'America/Chicago', Utah: 'America/Denver', Vermont: 'America/New_York', Virginia: 'America/New_York',
    Washington: 'America/Los_Angeles', 'West Virginia': 'America/New_York', Wisconsin: 'America/Chicago', Wyoming: 'America/Denver' };
  const SPLIT_NOTE = { Florida: 'the western panhandle is Central', Idaho: 'the north is Pacific', Indiana: 'the northwest and southwest corners are Central', Kansas: 'the western edge is Mountain', Kentucky: 'the west is Central', Michigan: 'four Upper Peninsula counties are Central',
    Nebraska: 'the west is Mountain', 'North Dakota': 'the southwest is Mountain', Oregon: 'Malheur County is Mountain', 'South Dakota': 'the west is Mountain', Tennessee: 'the east is Eastern', Texas: 'El Paso is Mountain' };
  const CITY_TZ = { Texas: { 'el paso': 'America/Denver' }, Tennessee: { knoxville: 'America/New_York', chattanooga: 'America/New_York', 'johnson city': 'America/New_York' }, Florida: { pensacola: 'America/Chicago', 'panama city': 'America/Chicago' },
    Indiana: { evansville: 'America/Chicago', gary: 'America/Chicago', hammond: 'America/Chicago' }, Kentucky: { 'bowling green': 'America/Chicago', paducah: 'America/Chicago', owensboro: 'America/Chicago' }, Idaho: { 'coeur d\'alene': 'America/Los_Angeles', lewiston: 'America/Los_Angeles' } };
  const CA_TZ = { Ontario: 'America/Toronto', Quebec: 'America/Toronto', 'British Columbia': 'America/Vancouver', Alberta: 'America/Edmonton', Manitoba: 'America/Winnipeg', Saskatchewan: 'America/Regina', 'Nova Scotia': 'America/Halifax', 'New Brunswick': 'America/Moncton', 'Prince Edward Island': 'America/Halifax', 'Newfoundland and Labrador': 'America/St_Johns' };
  const COUNTRY_TZ = { 'United Kingdom': 'Europe/London', Ireland: 'Europe/Dublin', Germany: 'Europe/Berlin', France: 'Europe/Paris', Switzerland: 'Europe/Zurich', Poland: 'Europe/Warsaw', India: 'Asia/Kolkata', Israel: 'Asia/Jerusalem', Philippines: 'Asia/Manila', Pakistan: 'Asia/Karachi', 'South Africa': 'Africa/Johannesburg', Colombia: 'America/Bogota', Venezuela: 'America/Caracas', Guinea: 'Africa/Conakry' };
  function tzOf(p) {
    const st = s(p && p.state), ctry = s(p && p.country), city = s(p && p.city);
    if (/^(united states|usa|us)$/i.test(ctry) || (!ctry && US_TZ[st])) {
      const c = CITY_TZ[st] && CITY_TZ[st][city.toLowerCase()];
      if (c) return { tz: c, basis: city + ', ' + st };
      if (US_TZ[st]) return { tz: US_TZ[st], basis: (city ? city + ', ' : '') + st + (SPLIT_NOTE[st] ? ' (state default; ' + SPLIT_NOTE[st] + ')' : '') };
      return { tz: 'America/New_York', basis: 'no state on the Contacts row: Eastern assumed', assumed: true };
    }
    if (/^canada$/i.test(ctry)) return CA_TZ[st] ? { tz: CA_TZ[st], basis: (city ? city + ', ' : '') + st } : { tz: 'America/Toronto', basis: 'no province on the Contacts row: Eastern assumed', assumed: true };
    if (COUNTRY_TZ[ctry]) return { tz: COUNTRY_TZ[ctry], basis: [city, st, ctry].filter(Boolean).join(', ') };
    return { tz: 'America/New_York', basis: 'no location on the Contacts row: Eastern assumed', assumed: true };
  }
  const DTF = {};
  function partsOf(d, tz) { const f = DTF[tz] || (DTF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' }));
    const o = {}; for (const x of f.formatToParts(d)) o[x.type] = x.value; if (o.hour === '24') o.hour = '00'; return o; }
  function tzOffsetMs(d, tz) { const p = partsOf(d, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000; }
  function localYmd(d, tz) { const p = partsOf(d, tz); return p.year + '-' + p.month + '-' + p.day; }
  function localHm(d, tz) { const p = partsOf(d, tz); return p.hour + ':' + p.minute; }
  function zonedTime(day, hm, tz) {   // the instant of wall time `day hm` in tz
    const [y, mo, d] = day.split('-').map(Number), [H, M] = hm.split(':').map(Number); const guess = Date.UTC(y, mo - 1, d, H, M);
    let t = guess - tzOffsetMs(new Date(guess), tz); const t2 = guess - tzOffsetMs(new Date(t), tz); if (t2 !== t) t = t2; return new Date(t);
  }
  const dayAdd = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayOf = (day) => WEEKDAY[new Date(day + 'T12:00:00Z').getUTCDay()];
  function offWeekend(day) { const w = new Date(day + 'T12:00:00Z').getUTCDay(); return w === 6 ? { day: dayAdd(day, 2), from: 'Saturday' } : w === 0 ? { day: dayAdd(day, 1), from: 'Sunday' } : { day, from: '' }; }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayLabel(d, tz) { const p = partsOf(d, tz); return p.weekday + ' ' + (+p.day) + ' ' + MON[+p.month - 1]; }
  const plainDay = (day) => weekdayOf(day).slice(0, 3) + ' ' + (+day.slice(8)) + ' ' + MON[+day.slice(5, 7) - 1];
  function tzShort(d, tz) { try { const x = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short', hour: 'numeric' }).formatToParts(d).find(y => y.type === 'timeZoneName'); return x ? x.value : tz; } catch (e) { return tz; } }
  function slotLabels(a, b, tz) {
    const loc = dayLabel(a, tz) + ', ' + localHm(a, tz) + ' to ' + localHm(b, tz) + ' ' + tzShort(a, tz);
    const il = (localYmd(a, IL) !== localYmd(a, tz) ? dayLabel(a, IL) + ', ' : '') + localHm(a, IL) + ' to ' + localHm(b, IL) + ' Israel';
    return { localLabel: loc, israelLabel: il };
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  function windowsFrom(cfg) {
    const parse = (v) => { const m = /^\s*(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})\s*$/i.exec(s(v)); if (!m) return null; const a = pad2(m[1]) + ':' + m[2], b = pad2(m[3]) + ':' + m[4]; return a < b && b <= '23:59' ? { start: a, end: b } : null; };
    const e = parse(cfg.email_window_local), c = parse(cfg.call_window_local); const bad = [];
    if (s(cfg.email_window_local) && !e) bad.push('Config email_window_local "' + s(cfg.email_window_local) + '" is not HH:MM-HH:MM; the default is used');
    if (s(cfg.call_window_local) && !c) bad.push('Config call_window_local "' + s(cfg.call_window_local) + '" is not HH:MM-HH:MM; the default is used');
    const cd = s(cfg.call_delay_days); const callDelay = /^[0-3]$/.test(cd) ? +cd : 1;   // 1.2: days from an email to the call that follows it (a starting rule to test; Config call_delay_days, 0 to 3)
    if (cd && !/^[0-3]$/.test(cd)) bad.push('Config call_delay_days "' + cd + '" is not 0 to 3; 1 is used');
    return { callDelay, email: e ? Object.assign(e, { basis: 'your Config email_window_local' }) : { start: '09:00', end: '11:30', basis: 'default: the contact\'s morning, 9:00 to 11:30 local (drafts)' },
      phone: c ? Object.assign(c, { basis: 'your Config call_window_local' }) : { start: '09:00', end: '11:30', basis: 'default: the calling window, 9:00 to 11:30 local (drafts)' }, invalid: bad };
  }
  function bucketOf(a, b, now) {
    if (now > b) return 'overdue'; if (now >= a) return 'now';
    const d = dayDiff(ilDay(a), ilDay(now)); return d === 0 ? 'today' : d <= 3 ? 'soon' : 'later';
  }
  const STEP_NAME = { E1: 'Email 1', FU1: 'Follow-up 1', FU2: 'Follow-up 2', FU3: 'Follow-up 3', LI: 'LinkedIn connection request', C1: 'Call 1', C2: 'Call 2', VM1: 'Voicemail 1 (call)', VM2: 'Voicemail 2 (call)' };
  const STEP_ORDER = { E1: 1, LI: 2, C1: 3, VM1: 3, FU1: 4, C2: 5, VM2: 5, FU2: 6, FU3: 7 };
  // 1.1: outcome words. A conversation on the phone stops the automatic sequence; these do not: no_answer, voicemail, wrong_number.
  const CONVERSATION = /^connected/i, NOT_INTERESTED = /^(connected_not_interested|not_interested|declined|no_fit)/i, CALL_DONE = /^(no_answer|voicemail|wrong_number|callback_requested|connected)/i;
  const TALK = { connected_no_interest: 'no clear interest', connected_info_requested: 'asked for information', connected_redirect: 'pointed you to a colleague', connected_not_interested: 'not interested', connected: 'spoke' };
  // One cadence per person with Queue jobs at this firm. Anchor: the actual Email 1 send (Queue sent_at, else the Activity row
  // that marked it sent). Day-0 steps are due right after Email 1 inside the window; a follow-up is due on the contact's local
  // date of Email 1 plus its day_offset, never earlier than its gap after the previous email actually went out, and waits while
  // that previous email is unsent. Saturdays and Sundays move to Monday. A touch_reschedule row sets another date, with its
  // reason; the weekend rule still applies and the Queue job itself is unchanged. Stops: a reply or a meeting stops every
  // unsent touch to the person (gate R5), an opt-out every channel, a bounce email only; Suppression and gate hard blocks win.
  // ---------- 1.6: effective schedule per person ----------
  // One schedule per person with Queue jobs at this firm. Every actionable step has ONE effective time (slotStart, in the
  // contact's zone); the original plan and every change stay in `plan` and `history` for the details view.
  //   Anchor. Email 1 unsent: its proposed time is the first contact window on or after the start (Config program_start, a
  //   company or contact start override, latest wins), never reset by a refresh. Email 1 sent: the actual send.
  //   Spacing. A follow-up is Email 1's anchor day + its day_offset, and never earlier than its gap after the email before it
  //   (that email's actual send day, or its own effective day while unsent), so a late send pushes what depends on it. An
  //   unsent prerequisite keeps the step "planned", never "due", whatever the date. Day-0 steps go with Email 1.
  //   Overrides. touch_reschedule (a day, or an exact instant) moves one step; an explicit override on a later step stands
  //   even when an earlier step moves. schedule_set pause_set holds a person or firm until a time; resumed lifts it.
  //   Weekends move to Monday; an explicit instant on a weekend or outside the window stands with a warning. DST is handled
  //   by computing every instant from the wall time in the contact's zone on that date.
  //   Stops: a reply or meeting stops every unsent touch to the person (gate R5), an opt-out every channel, a bounce email
  //   only; Suppression and gate hard blocks always win, and no change of date clears any of them.
  const isInstant = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s(v)) && !isNaN(Date.parse(s(v)));
  function firstSlot(fromInstant, tz, win) {   // the first window on or after an instant, weekdays only
    let day = localYmd(fromInstant, tz);
    for (let i = 0; i < 10; i++) {
      const wk = offWeekend(day); if (wk.from) { day = wk.day; continue; }
      const a = zonedTime(day, win.start, tz), b = zonedTime(day, win.end, tz);
      if (fromInstant > b) { day = dayAdd(day, 1); continue; }
      return { day, start: fromInstant > a ? fromInstant : a, end: b, late: fromInstant > a };
    }
    return null;
  }
  function overridesOf(f) {   // start, pause and resume rows (schedule_set), latest first, by scope
    const at = (a) => toDate(a.logged_at) || toDate(a.ts);
    return f.activity.filter(a => s(a.action) === 'schedule_set' && at(a)).sort((x, y) => at(y) - at(x));
  }
  function startFor(f, rows, pk, ck, program) {
    const mine = (a) => (s(a.apollo_person_id) && s(a.apollo_person_id) === pk) || (s(a.contact_key) && s(a.contact_key) === ck);
    const firm = (a) => !s(a.contact_key) && !s(a.apollo_person_id);
    const st = rows.find(a => s(a.outcome) === 'start_set' && mine(a) && isInstant(a.next_action_date)) || rows.find(a => s(a.outcome) === 'start_set' && firm(a) && isInstant(a.next_action_date));
    const start = st ? { at: new Date(s(st.next_action_date)), basis: (s(st.contact_key) ? 'start set for this person' : 'batch start set for the firm') + (s(st.notes) ? ': ' + s(st.notes) : ''), id: s(st.activity_id) }
      : program ? { at: program, basis: 'the program start (Config program_start)', id: '' } : null;
    const pauseAt = (scope) => { const r = rows.find(a => (s(a.outcome) === 'pause_set' || s(a.outcome) === 'resumed') && scope(a)); return r && s(r.outcome) === 'pause_set' && isInstant(r.next_action_date) ? { at: new Date(s(r.next_action_date)), reason: s(r.notes), id: s(r.activity_id), scope: s(r.contact_key) ? 'person' : 'firm' } : null; };
    const p1 = pauseAt(mine), p2 = pauseAt(firm); const pause = [p1, p2].filter(Boolean).sort((x, y) => y.at - x.at)[0] || null;
    return { start, pause };
  }
  function cadenceOf(f, env) {
    const now = env.now, W = env.windows, out = [], at = (a) => toDate(a.logged_at) || toDate(a.ts);
    const groups = new Map();
    for (const j of f.jobs) { const k = j.apollo_person_id || j.contact_key; if (!k) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); }
    const ovr = overridesOf(f);
    const supersedes = (j) => { const m = /superseded by ([0-9a-f]{12})/.exec(j.hard_blocks || ''); return m ? m[1] : ''; };
    for (const [pk, js] of groups) {
      const live = js.filter(j => j.sent || !j.cancelled); if (!live.length) continue;
      const j0 = js[0]; const person = f.people.find(p => (j0.apollo_person_id && p.apollo_person_id === j0.apollo_person_id) || p.contact_key === j0.contact_key) || null;
      const name = person ? person.name : (j0.contact_key.split(' | ')[1] || j0.contact_key);
      const Z = tzOf(person || {}); const tz = Z.tz;
      const mine = (a) => (s(a.apollo_person_id) && s(a.apollo_person_id) === j0.apollo_person_id) || (s(a.contact_key) && s(a.contact_key) === j0.contact_key);
      const acts = f.activity.filter(mine);   // newest first
      const sentAtOf = (j) => toDate(j.sent_at) || f.activity.filter(a => s(a.job_key) === j.job_key && /^sent$/i.test(s(a.outcome))).map(a => toDate(a.ts)).filter(Boolean).sort((a, b) => a - b)[0] || null;
      const e1 = live.find(j => j.step === 'E1' && j.sent) || live.find(j => j.step === 'E1') || null;
      const e1At = e1 && e1.sent ? sentAtOf(e1) : null;
      const reply = acts.find(a => /^replied/i.test(s(a.outcome))), meet = acts.find(a => /^meeting_/i.test(s(a.outcome)) && !/no_show/i.test(s(a.outcome)));
      const opt = acts.find(a => /^opt_?out/i.test(s(a.outcome))), noint = acts.find(a => NOT_INTERESTED.test(s(a.outcome))), bounce = acts.find(a => /^bounce/i.test(s(a.outcome)));
      const talk = acts.find(a => CONVERSATION.test(s(a.outcome)) && !NOT_INTERESTED.test(s(a.outcome)));
      const day = (a) => plainDay(ilDay(toDate(a.ts)));
      const stop = env.stopRow ? { kind: 'account', label: 'firm stopped by an account-level Suppression row' }
        : opt ? { kind: 'opt_out', label: 'asked not to be contacted ' + day(opt) + ': every channel stopped', at: s(opt.ts) }
        : noint ? { kind: 'not_interested', label: 'said not interested ' + day(noint) + ': every touch to them stopped; no new approach without your decision', at: s(noint.ts) }
        : meet ? { kind: 'meeting', label: 'meeting logged ' + day(meet) + ': sequence stopped (gate R5)', at: s(meet.ts) }
        : talk ? { kind: 'conversation', label: 'you spoke ' + day(talk) + ' (' + (TALK[s(talk.outcome).toLowerCase()] || 'spoke') + '): the automatic sequence stopped; your next step is by hand', at: s(talk.ts) }
        : reply ? { kind: 'reply', label: 'replied ' + day(reply) + ' (' + s(reply.outcome).replace(/^replied_/, '') + '): sequence stopped (gate R5); answer the reply instead', at: s(reply.ts) } : null;
      const so = startFor(f, ovr, j0.apollo_person_id, j0.contact_key, env.programStart); let start = so.start; let pause = so.pause;
      // 1.3: the backup's start: a manual switch row carries it; otherwise the account transition gives it (never the program start)
      const TR = f.transition || null; const isBk = TR && TR.backup && ((TR.backup.contact_key && TR.backup.contact_key === j0.contact_key) || (f.backup && f.backup.contact_key === j0.contact_key));
      if (isBk) {
        const swRow = f.activity.find(a => /^backup_switched$/i.test(s(a.outcome)) && mine(a) && isInstant(a.next_action_date)) || null;
        const own = startFor(f, ovr.filter(a => (s(a.apollo_person_id) && s(a.apollo_person_id) === j0.apollo_person_id) || (s(a.contact_key) && s(a.contact_key) === j0.contact_key)), j0.apollo_person_id, j0.contact_key, null).start;
        if (swRow && !(own && at(ovr.find(a => s(a.activity_id) === own.id) || {}) > at(swRow))) start = { at: new Date(s(swRow.next_action_date)), basis: 'the start you chose when you switched to this person', id: s(swRow.activity_id) };
        else if (!own) start = TR.startAt ? { at: new Date(TR.startAt), basis: TR.transitioned ? TR.startBasis : 'the automatic continuation (' + (TR.reason || 'two business days after the primary\'s last touch') + ')', id: '' } : null;
      }
      // 1.2: the callback lifecycle. The latest callback request (a newer one replaces it) holds the person's automatic touches
      // until its outcome is logged against it (link_id), or you resume the person after it. Unattempted: an open hold, and the
      // callback shows overdue once its time has passed. Attempted without a conversation: the hold ends with that day, their time.
      const cb = acts.find(a => /^callback_requested$/i.test(s(a.outcome)) && isInstant(a.next_action_date));
      let callback = null;
      if (cb) {
        const cbId = s(cb.activity_id); const mv = acts.find(a => s(a.outcome) === 'callback_moved' && cbId && s(a.link_id) === cbId && isInstant(a.next_action_date)) || null;   // newest move wins
        const cbAt = new Date(s((mv || cb).next_action_date));
        const linked = acts.find(a => a !== cb && cbId && s(a.link_id) === cbId && s(a.channel) === 'phone' && CALL_DONE.test(s(a.outcome))) || null;
        const resumed = ovr.find(a => s(a.outcome) === 'resumed' && ((s(a.contact_key) && s(a.contact_key) === j0.contact_key) || (s(a.apollo_person_id) && s(a.apollo_person_id) === j0.apollo_person_id) || (!s(a.contact_key) && !s(a.apollo_person_id))) && at(a) > at(cb)) || null;
        const label = dayLabel(cbAt, tz) + ', ' + localHm(cbAt, tz) + ' ' + tzShort(cbAt, tz);
        callback = { at: cbAt, id: cbId, notes: s(cb.notes), label, moved: mv ? { at: s(mv.ts), reason: s(mv.notes) } : null, done: linked ? s(linked.outcome).toLowerCase() : '', doneAt: linked ? s(linked.ts) : '', doneId: linked ? s(linked.activity_id) : '', released: resumed ? 'resumed' : '',
          overdue: !linked && now.getTime() > cbAt.getTime() + 30 * 6e4 };
        let hold = null;
        if (!linked && !resumed) hold = { at: null, open: true, reason: 'callback ' + label + (callback.overdue ? ' (overdue, not logged yet)' : ' (not logged yet)'), id: cbId, scope: 'person', callback: true };
        else if (linked && !CONVERSATION.test(s(linked.outcome))) { const ta = toDate(linked.ts) || at(linked); hold = { at: zonedTime(localYmd(ta, tz), '23:59', tz), reason: 'callback attempted ' + dayLabel(ta, tz) + ' (' + s(linked.outcome).replace(/_/g, ' ') + ')', id: cbId, scope: 'person', callback: true }; }
        if (hold && (hold.open || !pause || hold.at > pause.at)) pause = hold;
      }
      const holdNow = pause && (pause.open || pause.at > now);
      const paused = pause && pause.at > now ? pause : null;
      // reschedule rows: by job_key, and carried over from a job this one supersedes (a revised text keeps its date)
      const chain = (j) => { const keys = [j.job_key]; for (const q of js) if (supersedes(q) && keys.includes(supersedes(q))) keys.push(q.job_key); for (const q of js) if (keys.includes(supersedes(q)) && !keys.includes(q.job_key)) keys.push(q.job_key); return keys; };
      const older = (j) => js.filter(q => q.cancelled && supersedes(q) === j.job_key).map(q => q.job_key);
      const rsOf = (j) => f.activity.filter(a => [j.job_key, ...older(j)].includes(s(a.job_key)) && (s(a.action) === 'touch_reschedule' || /^touch_rescheduled$/i.test(s(a.outcome))) && (isInstant(a.next_action_date) || /^\d{4}-\d{2}-\d{2}$/.test(s(a.next_action_date))) && at(a)).sort((a, b) => at(b) - at(a));
      const steps = [];
      const role = f.primary && f.primary.contact_key === j0.contact_key ? 'primary' : f.backup && f.backup.contact_key === j0.contact_key ? 'backup' : '';
      // 1.4: every sequence shows its call stages. A primary carries Call 1 (day 1) and Call 2 (day 6), a backup Backup Call 1 (day 1).
      // When no live Queue row exists for a stage (the draft left it out: DNC listed, suppressed, no number, no verdict yet, or a
      // backup drafted before the verdict rule) the stage is shown as a virtual step, blocked with the exact reason. It is informational:
      // never due, never a task, never a reminder, and it holds no other step up. A drafted row replaces it once Prepare adds one.
      const stages = role === 'primary' ? [['C1', 1], ['C2', 6]] : role === 'backup' ? [['C1', 1]] : [];
      const virtual = stages.filter(([st]) => !live.some(j => j.channel === 'phone' && (j.step === st || (st === 'C1' && j.step === 'VM1') || (st === 'C2' && j.step === 'VM2'))))
        .map(([st, off]) => ({ job_key: '', step: st, channel: 'phone', day_offset: off, status: 'not drafted', hard_blocks: '', conditions: '', contact_key: j0.contact_key, apollo_person_id: j0.apollo_person_id, sent: false, cancelled: false, due: '', virtual: true }));
      const sorted = live.concat(virtual).sort((a, b) => (+a.day_offset || 0) - (+b.day_offset || 0) || (STEP_ORDER[a.step] || 9) - (STEP_ORDER[b.step] || 9));
      let e1Step = null;
      for (const j of sorted) {
        const off = +j.day_offset || 0; const chan = j.channel;
        const x = { key: f.key, firm: f.firm, person: name, contact_key: j.contact_key, apollo_person_id: j.apollo_person_id, tz, job_key: j.job_key, step: j.step, name: (role === 'backup' && j.step === 'C1') ? 'Backup Call 1' : (STEP_NAME[j.step] || j.step), channel: chan, day_offset: off, gate_status: j.status, gate_due: j.due,
          approved: !!s(j.approved_by), edited: !!j.edited, virtual: !!j.virtual,
          state: '', why: '', due: '', planned: '', basis: '', notes: [], warnings: [], slotStart: null, slotEnd: null, bucket: '', localLabel: '', israelLabel: '', rescheduled: null, moved: '', paused: null, plan: null, history: [] };
        steps.push(x); if (j.step === 'E1') e1Step = x;
        if (j.sent) { x.state = 'sent'; x.at = sentAtOf(j); x.why = x.at ? 'sent ' + dayLabel(x.at, tz) + ', ' + localHm(x.at, tz) + ' ' + tzShort(x.at, tz) : 'sent';
          if (chan === 'phone') { const r = f.activity.find(a => s(a.job_key) === j.job_key && s(a.channel) === 'phone'); x.outcome = r ? s(r.outcome).toLowerCase() : ''; x.at = x.at || (r && toDate(r.ts)) || null;
            x.why = 'called' + (x.at ? ' ' + dayLabel(x.at, tz) + ', ' + localHm(x.at, tz) + ' ' + tzShort(x.at, tz) : '') + (x.outcome ? ': ' + (TALK[x.outcome] || x.outcome.replace(/_/g, ' ')) : ''); }
          // 1.6: the original plan stays beside a sent Email 1 (start-based) so a late or early send is explained, never hidden
          if (j.step === 'E1' && start && x.at) { const w0 = W[chan === 'phone' ? 'phone' : 'email']; const sl = firstSlot(start.at, tz, w0); if (sl) { const late = Math.round((Date.parse(localYmd(x.at, tz) + 'T12:00:00Z') - Date.parse(sl.day + 'T12:00:00Z')) / 864e5);
            x.plan = { anchor: start.at.toISOString(), anchorBasis: start.basis, cadence: sl.day }; x.basis = 'planned ' + plainDay(sl.day) + ' (' + start.basis + '); sent ' + (late > 0 ? late + ' day' + (late === 1 ? '' : 's') + ' late' : late < 0 ? (-late) + ' day' + (late === -1 ? '' : 's') + ' early' : 'on the planned day') + '; later steps count from the actual send'; } }
          continue; }
        if (stop) { x.state = 'stopped'; x.why = stop.label; continue; }
        if (bounce && chan === 'email') { x.state = 'stopped'; x.why = 'email bounced ' + day(bounce) + ': email stopped; LinkedIn and calls may continue; never guess another address'; continue; }
        const perm = person && person.channels[chan] ? person.channels[chan].perm : null;
        if (chan === 'phone' && person && person.channels.phone && person.channels.phone.avail === 'no number') { x.state = 'blocked'; x.why = 'held: no number on file; no call until a number is found and its do-not-call status checked'; continue; }   // 1.4
        if (perm && perm.level === 'blocked') { x.state = 'blocked'; x.why = 'no permission on ' + chan + ': ' + perm.text; continue; }
        if (perm && perm.unverified && chan === 'phone') { x.state = 'blocked'; x.why = 'held: ' + perm.text; continue; }   // 1.3.1: a number without a do-not-call verdict is not called
        const hard = j.hard_blocks.split('; ').filter(Boolean).filter(h => !/waits for Email 1/i.test(h) && !/^backup sequence: (automatic continuation from|switched by you; starts)/i.test(h));   // gate R10 is the prerequisite the schedule tracks (planned until Email 1 goes out); 1.3: the backup's start date likewise
        const bkWait = j.hard_blocks.split('; ').find(h => /^backup sequence: (automatic continuation from|switched by you; starts)/i.test(h)) || '';
        if (hard.length) { x.state = 'blocked'; x.why = 'gate hard block: ' + hard.join('; '); continue; }
        const win = W[chan === 'phone' ? 'phone' : 'email']; x.window = win.start + ' to ' + win.end + ' local (' + win.basis + ')';
        const rsRows = rsOf(j); const rs = rsRows[0] || null;
        x.history = rsRows.map(a => ({ to: s(a.next_action_date), reason: s(a.notes), at: at(a).toISOString(), id: s(a.activity_id) }));
        let base = '', basis = '', waitsFor = null, slotA = null, slotB = null, explicit = null;
        if (j.step === 'E1') {
          if (!start) { x.state = 'unsent'; x.why = 'not started: no start chosen for this person yet; Review and schedule sets it, and every date follows from that start (the program start is never inherited)'; continue; }   // 1.3.1
          const sl = firstSlot(start.at, tz, win); base = sl.day; basis = 'first window on or after ' + start.basis + ' (' + dayLabel(start.at, IL) + ' ' + localHm(start.at, IL) + ' Israel)'; slotA = sl.start; slotB = sl.end;
          x.plan = { anchor: start.at.toISOString(), anchorBasis: start.basis, cadence: base };
        } else if (!e1At && !e1Step) { x.state = 'planned'; x.why = 'no Email 1 job for this person'; continue; }
        else {
          const anchorDay = e1At ? localYmd(e1At, tz) : (e1Step && e1Step.due) || ''; if (!anchorDay) { x.state = 'planned'; x.why = 'waits for Email 1 (no start set)'; continue; }
          base = dayAdd(anchorDay, off); basis = (e1At ? 'Email 1 sent ' : 'Email 1 planned ') + plainDay(anchorDay) + (off ? ' + ' + off + ' days' : (e1At ? ', ' + localHm(e1At, tz) : '') + ' (same day)');
          x.plan = { anchor: e1At ? e1At.toISOString() : (e1Step.slotStart ? e1Step.slotStart.toISOString() : ''), anchorBasis: e1At ? 'actual Email 1 send' : 'planned Email 1', cadence: base };
          if (!e1At) waitsFor = 'Email 1';
          if (chan === 'email' && off > 0) {
            const prev = steps.filter(y => y !== x && y.channel === 'email' && y.day_offset < off && !['stopped', 'blocked'].includes(y.state)).pop();
            if (prev) {
              const prevDay = prev.at ? localYmd(prev.at, tz) : prev.due; const gap = off - prev.day_offset;
              if (prevDay) { const floor = dayAdd(prevDay, gap); if (floor > base) { x.plan.spacing = { after: prev.name, prevDay, gap, from: base }; base = floor; basis = prev.name + (prev.at ? ' sent ' : ' planned ') + plainDay(prevDay) + ' + ' + gap + ' days (spacing kept)'; } }
              if (prev.state !== 'sent') waitsFor = waitsFor || prev.name;
            }
          }
          if (chan === 'phone' && off > 0) {   // 1.1: a call follows the email before it by one business day and keeps its gap after the previous call
            const prevE = steps.filter(y => y !== x && y.channel === 'email' && y.day_offset <= off && !['stopped', 'blocked'].includes(y.state)).pop();
            const cdl = W.callDelay == null ? 1 : W.callDelay;
            if (prevE) { const pd = prevE.at ? localYmd(prevE.at, tz) : prevE.due; if (pd) { const fl = dayAdd(pd, cdl); if (fl >= base || cdl !== 1) { base = fl; basis = (cdl === 1 ? 'the business day after ' : cdl === 0 ? 'the same day as ' : cdl + ' days after ') + prevE.name + (prevE.at ? ' (sent ' : ' (planned ') + plainDay(pd) + ')'; } }
              if (prevE.state !== 'sent') waitsFor = prevE.name; x.after = prevE.name; }
            const prevC = steps.filter(y => y !== x && !y.virtual && y.channel === 'phone' && y.day_offset > 0 && y.day_offset < off && !['stopped', 'blocked', 'missed'].includes(y.state)).pop();
            if (prevC && (prevC.at || prevC.due)) { const cd = prevC.at ? localYmd(prevC.at, tz) : prevC.due; const fl = dayAdd(cd, off - prevC.day_offset); if (fl > base) { x.plan.spacing = { after: prevC.name, prevDay: cd, gap: off - prevC.day_offset, from: base }; base = fl; basis = prevC.name + (prevC.at ? ' made ' : ' planned ') + plainDay(cd) + ' + ' + (off - prevC.day_offset) + ' days (spacing kept)'; } }
          }
          if (off === 0 && e1At) { slotA = new Date(Math.max(e1At.getTime(), zonedTime(base, win.start, tz).getTime())); slotB = zonedTime(base, win.end, tz); if (slotB < new Date(slotA.getTime() + 2 * 36e5)) slotB = new Date(slotA.getTime() + 2 * 36e5); }
          if (off === 0 && !e1At && e1Step && e1Step.slotStart) { slotA = e1Step.slotStart; slotB = e1Step.slotEnd; base = e1Step.due; basis = 'with Email 1, planned ' + e1Step.localLabel; x.withE1 = true; }
        }
        x.planned = base;
        if (rs) {
          const v = s(rs.next_action_date); const to = v.slice(0, 10);
          x.rescheduled = { from: base, to, reason: s(rs.notes), at: at(rs).toISOString(), id: s(rs.activity_id), instant: isInstant(v) ? new Date(v).toISOString() : '' };
          if (x.plan && x.plan.spacing && to < base) x.notes.push('earlier than the spacing after ' + x.plan.spacing.after + ' (' + plainDay(base) + ')');
          else if (to < base) x.notes.push('earlier than the cadence (' + plainDay(base) + ')');
          if (isInstant(v)) { explicit = new Date(v); base = localYmd(explicit, tz); } else base = to;
          basis = 'rescheduled by you from ' + plainDay(x.planned) + ': ' + (s(rs.notes) || 'no reason given'); slotA = slotB = null;
        }
        if (pause && pause.open) x.paused = { until: '', open: true, reason: pause.reason, scope: pause.scope, from: base, id: pause.id, callback: !!pause.callback };
        else if (pause && !explicit && !x.withE1) { const pa = zonedTime(base, win.start, tz); if (pause.at > pa) { const sl = firstSlot(pause.at, tz, win); x.paused = { until: pause.at.toISOString(), reason: pause.reason, scope: pause.scope, from: base, id: pause.id, callback: !!pause.callback }; base = sl.day; basis = pause.callback ? 'held for the ' + pause.reason + ' (their automatic touches wait until that day ends)' : 'paused (' + pause.scope + ') until ' + dayLabel(pause.at, IL) + ' ' + localHm(pause.at, IL) + ' Israel' + (pause.reason ? ': ' + pause.reason : ''); slotA = sl.start; slotB = sl.end; } }
        if (!explicit && !x.withE1) { const wk = offWeekend(base); if (wk.from) { x.moved = wk.from; x.notes.push('moved from ' + wk.from + ' ' + plainDay(base) + ' to Monday'); base = wk.day; slotA = slotB = null; } }
        x.due = base; x.basis = basis;
        let a = slotA || zonedTime(x.due, win.start, tz), b = slotB || zonedTime(x.due, win.end, tz);
        if (explicit) { a = explicit; const wa = zonedTime(x.due, win.start, tz), wb = zonedTime(x.due, win.end, tz); b = (explicit >= wa && explicit <= wb) ? wb : new Date(explicit.getTime() + 36e5);
          if (offWeekend(x.due).from) x.warnings.push('set on a ' + offWeekend(x.due).from); if (explicit < wa || explicit > wb) x.warnings.push('outside the ' + win.start + ' to ' + win.end + ' window'); }
        // 1.2: a hold wins over an exact time: a step set inside the hold goes at the first window after it
        if (explicit && pause && !pause.open && explicit < pause.at) { const sl = firstSlot(pause.at, tz, win);
          x.paused = { until: pause.at.toISOString(), reason: pause.reason, scope: pause.scope, from: localYmd(explicit, tz), id: pause.id, callback: !!pause.callback, overrode: explicit.toISOString() };
          x.notes.push('your exact time ' + dayLabel(explicit, tz) + ', ' + localHm(explicit, tz) + ' ' + tzShort(explicit, tz) + ' falls inside the ' + (pause.callback ? 'callback hold' : 'pause') + '; it goes at the first window after it');
          x.warnings = []; x.due = sl.day; a = sl.start; b = sl.end; basis = (pause.callback ? 'held for the ' + pause.reason : 'paused (' + pause.scope + ') until ' + dayLabel(pause.at, IL) + ' ' + localHm(pause.at, IL) + ' Israel') + '; your exact time falls inside it'; x.basis = basis; }
        x.slotStart = a; x.slotEnd = b; Object.assign(x, slotLabels(a, b, tz));
        if (x.paused && x.paused.open) { x.state = 'paused'; x.slotStart = x.slotEnd = null; x.localLabel = x.israelLabel = ''; x.why = 'held: ' + pause.reason + '; nothing goes out until you log it, set a new time or resume'; continue; }
        if (j.due && j.due !== x.due && !rs) x.notes.push('the gate condition says due ' + j.due + ' (UTC date of Email 1 + ' + off + ' days)' + (x.moved ? '; the Desk plans the weekday' : ''));
        if (chan === 'phone' && !env.usNumber) { x.state = 'waiting'; x.why = 'would be due ' + x.localLabel + ', but calls wait for the US number (Config us_number)'; continue; }
        if (!waitsFor && bkWait && j.step === 'E1') waitsFor = 'the backup start';   // 1.3: planned at its start, never due before the gate releases it
        if (waitsFor) { x.state = 'planned'; x.waitsFor = waitsFor; x.why = 'planned ' + x.localLabel + '; waits for ' + waitsFor + ' to go out first'; continue; }
        if (x.paused && holdNow) { x.state = 'paused'; x.why = pause.callback ? 'held for the ' + pause.reason + '; then ' + x.localLabel : 'paused until ' + dayLabel(pause.at, IL) + ' ' + localHm(pause.at, IL) + ' Israel; then ' + x.localLabel; continue; }
        x.state = 'due'; x.bucket = bucketOf(a, b, now);
        x.why = x.bucket === 'overdue' ? 'overdue since ' + dayLabel(b, tz) + ', ' + localHm(b, tz) + ' ' + tzShort(b, tz) : 'due ' + x.localLabel;
      }
      // 1.4: a virtual call stage that reached a plannable state is still blocked: nothing exists to say or leave on voicemail
      for (const x of steps) if (x.virtual && !['stopped', 'blocked'].includes(x.state)) {
        const when = x.state === 'due' || x.state === 'planned' ? (x.localLabel ? 'would fall ' + x.localLabel : x.waitsFor ? 'waits for ' + x.waitsFor : x.why) : x.why;
        x.state = 'blocked'; x.bucket = ''; x.slotStart = x.slotEnd = null;
        x.why = 'held: no call script or voicemail drafted for this stage yet' + (role === 'backup' && !e1At ? '; a backup call follows the backup\'s own Email 1, after the recorded transition and your authorization' : '') + (when ? ' (' + when + ')' : '') + '; Prepare adds the row for your review once the number is checked';
      }
      // 1.1: who performs each step, missed calls, and what a call does (not) hold up
      for (const x of steps) {
        x.who = x.channel === 'email' ? 'system' : 'you';
        if (x.channel !== 'phone' || !(x.day_offset > 0) || ['sent', 'stopped', 'blocked'].includes(x.state)) continue;
        const nextE = steps.find(y => y.channel === 'email' && y.day_offset > x.day_offset);
        const nextC = steps.find(y => y.channel === 'phone' && y.day_offset > x.day_offset && !['sent', 'stopped', 'blocked'].includes(y.state));
        if (nextE && nextE.state === 'sent' && nextE.at && (!x.rescheduled || x.due <= localYmd(nextE.at, tz))) {
          x.state = 'missed'; x.bucket = ''; x.why = 'not called before ' + nextE.name + ' went out (' + dayLabel(nextE.at, tz) + '); nothing was recorded as a touch; ' + (nextC ? nextC.name + ' takes over' : 'the emails continue');
        } else if (nextE && !['stopped', 'blocked'].includes(nextE.state)) x.dependency = nextE.name + (nextE.localLabel ? ' (' + nextE.localLabel + ')' : '') + ' goes out whether or not this call happens; it does not mention the call';
      }
      const next = steps.filter(y => y.state === 'due').sort((p, q) => p.slotStart - q.slotStart)[0] || null;
      // 1.4: an out-of-office absence on record (a pause whose reason names it, from the mailbox capture or logged by hand): shown as
      // "Out of office until <return day>" while it lasts; the pause itself is what moves any touch that falls inside it
      const oooM = pause && /out[- ]of[- ]office/i.test(s(pause.reason)) ? (/return date read from it: (\d{4}-\d{2}-\d{2})/i.exec(s(pause.reason)) || /until\s+(?:[A-Za-z]{3}\s+)?(\d{1,2}\s+[A-Za-z]{3,9}|\d{4}-\d{2}-\d{2})/i.exec(s(pause.reason))) : null;
      const ooo = pause && /out[- ]of[- ]office/i.test(s(pause.reason)) ? { until: pause.open ? '' : pause.at.toISOString(), untilLabel: pause.open ? 'a date to confirm' : dayLabel(pause.at, tz), returnDate: oooM ? oooM[1] : '', active: !!holdNow, byCapture: /captured from the mailbox/i.test(s(pause.reason)) } : null;
      out.push({ key: pk, name, contact_key: j0.contact_key, apollo_person_id: j0.apollo_person_id, tz, tzBasis: Z.basis, tzAssumed: !!Z.assumed, tzLabel: tzShort(now, tz), ooo,
        role, e1At: e1At ? e1At.toISOString() : '', e1Job: e1 ? e1.job_key : '', stop, steps, next,
        start: start ? { at: start.at.toISOString(), basis: start.basis } : null, pause: pause ? { until: pause.open ? '' : pause.at.toISOString(), open: !!pause.open, reason: pause.reason, scope: pause.scope, active: !!holdNow, callback: !!pause.callback } : null, callback: callback ? { at: callback.at.toISOString(), id: callback.id, notes: callback.notes, done: callback.done, doneAt: callback.doneAt, doneId: callback.doneId, released: callback.released, overdue: callback.overdue, localLabel: dayLabel(callback.at, tz) + ', ' + localHm(callback.at, tz) + ' ' + tzShort(callback.at, tz), israelLabel: dayLabel(callback.at, IL) + ', ' + localHm(callback.at, IL) + ' Israel' } : null });
    }
    return out.sort((a, b) => (a.role === 'primary' ? 0 : a.role === 'backup' ? 1 : 2) - (b.role === 'primary' ? 0 : b.role === 'backup' ? 1 : 2) || a.name.localeCompare(b.name));
  }

  // ---------- the sender's view ----------
  // sendableNow(step, now, windows): true only while the step is due and the clock sits inside its effective window; a missed
  // window rolls to the next weekday window (firstSlot from now), so an overdue email goes at the next morning window, never
  // in the night and never stacked with the next step (which stays planned until this one is actually sent).
  function sendableNow(x, now, W) {
    if (!x || x.state !== 'due' || x.channel !== 'email') return { ok: false, why: x ? x.state + (x.why ? ': ' + x.why : '') : 'no step' };
    if (x.slotStart && x.slotEnd && now >= x.slotStart && now <= x.slotEnd) return { ok: true, why: 'inside its window ' + x.localLabel };
    if (x.slotEnd && now > x.slotEnd) {
      const win = W.email; const sl = firstSlot(now, x.tz, win);
      if (sl && sl.start.getTime() === now.getTime()) return { ok: true, why: 'window ' + x.localLabel + ' passed; sending in the next weekday window (' + dayLabel(now, x.tz) + ', ' + localHm(now, x.tz) + ' ' + tzShort(now, x.tz) + ')' };
      return { ok: false, why: 'window ' + x.localLabel + ' passed; next weekday window ' + (sl ? dayLabel(sl.start, x.tz) + ', ' + localHm(sl.start, x.tz) + ' to ' + localHm(sl.end, x.tz) + ' ' + tzShort(sl.start, x.tz) : 'not found') };
    }
    return { ok: false, why: 'not before ' + x.localLabel };
  }
  // firmsFromTabs: the minimal firm objects cadenceOf needs, built from raw workbook rows (for OR-03 and offline tests).
  // people carry no permissions here: the gate's hard blocks on each job already carry Suppression.
  function firmsFromTabs(tabs, opts) {   // 1.3: opts.research, opts.suppression, opts.cfg, opts.now, opts.mailReview give each firm its backup transition (backup.js)
    const rows = (t) => (tabs[t] || []).filter(r => !/^template$/i.test(s(r.activity_id || r.job_key || r.contact_key || r.company_key)));
    const at = (a) => toDate(a.logged_at) || toDate(a.ts);
    const contacts = rows('Contacts'); const activity = rows('Activity').slice().sort((x, y) => (at(y) || 0) - (at(x) || 0));
    const sentKeys = new Set(activity.filter(a => /^sent$/i.test(s(a.outcome)) && s(a.job_key)).map(a => s(a.job_key)));
    const byFirm = new Map();
    for (const q of (opts && opts.queue) || rows('Queue')) {
      const k = s(q.company_key); if (!k) continue; if (!byFirm.has(k)) byFirm.set(k, []);
      const st = s(q.status).toLowerCase();
      byFirm.get(k).push(Object.assign({}, q, { job_key: s(q.job_key), step: s(q.step), channel: s(q.channel), day_offset: +q.day_offset || 0, status: s(q.status), hard_blocks: s(q.hard_blocks), conditions: s(q.conditions),
        contact_key: s(q.contact_key), apollo_person_id: s(q.apollo_person_id), sent: st === 'sent' || !!s(q.sent_at) || !!s(q.provider_message_id) || sentKeys.has(s(q.job_key)), cancelled: /^cancel/.test(st), due: (/due (\d{4}-\d{2}-\d{2})/.exec(s(q.conditions)) || [])[1] || '' }));
    }
    const out = [];
    for (const [k, jobs] of byFirm) {
      const people = contacts.filter(c => s(c.domain) === k).map(c => ({ contact_key: s(c.contact_key), apollo_person_id: s(c.apollo_person_id), name: s(c.full_name) || s(c.contact_key).split(' | ')[1] || s(c.contact_key), city: s(c.city), state: s(c.state), country: s(c.country), channels: {} }));
      const f = { key: k, firm: k, jobs, people, activity: activity.filter(a => s(a.company_key) === k), primary: null, backup: null };
      const R = opts && opts.research ? opts.research.find(r => s(r.company_key) === k) : null; const BB = root.BlocksBackup || null;
      if (R) { f.primary = { contact_key: s(R.primary_contact_key) }; f.backup = s(R.backup_contact_key) ? { contact_key: s(R.backup_contact_key) } : null; }
      if (R && BB) f.transition = BB.transitionOf({ company_key: k, research: R, contacts, jobs: (opts.queue || rows('Queue')).filter(q => s(q.company_key) === k), activity: f.activity, suppression: opts.suppression || [], cfg: opts.cfg || {}, now: opts.now || new Date(), mailReview: opts.mailReview || [] });
      out.push(f);
    }
    return out;
  }
  const api = { VERSION: '1.4', CONVERSATION, NOT_INTERESTED, TALK, tzOf, partsOf, localYmd, localHm, zonedTime, dayAdd, dayDiff, weekdayOf, offWeekend, dayLabel, plainDay, tzShort, slotLabels, windowsFrom, bucketOf, STEP_NAME, STEP_ORDER, isInstant, firstSlot, overridesOf, startFor, cadenceOf, sendableNow, firmsFromTabs, toDate, ilDay, IL };
  root.BlocksSchedule = api;
})(globalThis);

// BLOCKS mailbox capture, version 1.7 (1.7, 2 Oct 2026, after a contact's "I am out of the office returning Tuesday, 10/6" was read as having no date: the return date is read from the message's own text (quoted history ignored) by keyword and form, a weekday may stand before any date form ("returning Tuesday, 10/6"), a named weekday must match the date, a numeric date is month/day for a US or Canadian recipient and ambiguous elsewhere when both parts could be a month, "through" a date returns the next weekday, a weekday with no date ("back Monday") or a range is only a proposal to confirm, several different return dates are ambiguous; the event keeps an excerpt of the message for the Desk; an OOO hold is cleared by the capture itself, with the entry that resolved it, once a Desk decision (a pause, a resume or a start) or a later dated pause for that person is on record, or the event is resolved as something other than an out-of-office; 1.6, 30 Sep 2026: the pause ends when the return day starts in the recipient's own time zone (the Contacts row's city, state and country, the same rule as the schedule engine; 12:00Z only when the engine is not loaded); an out-of-office from an identified contact without a reliable return date gets one review item AND a temporary hold on every channel (a Suppression row scope contact, channel all, status hold_unverified, row_key ooo:<message id>) so no cold outreach and no reminder continues silently until the pause is set by hand or the hold is cleared; 1.5, 30 Sep 2026: an out-of-office pauses until the return day starts (12:00Z on the return date), never the day after; only touches inside the absence move; no return date or an ambiguous one goes to review with no automatic pause; 1.4, 1.4, 28 Sep 2026: a hand-sent email is attributed to a job only when the full reviewed text of exactly one email job of that person, any status, is in the body, that job is unsent and its subject matches; 1.3: a hand-sent email is reconciled to a job only with content evidence (recipient, subject AND the reviewed text), otherwise a review item that holds the person; a message from a tracked firm's domain outside any tracked thread is a review item, not ignored; 1.2: the Respond task is due on the Israel day of capture; 1.1: a message already in Mail_Events and untracked mail get no new row). Pure planning module shared by BLOCKS-OR-05 | Capture Mailbox and the
// offline tests: given the messages read from the Blocks mailbox (or fixture messages of the same shape) and the workbook tabs,
// it decides what each message is and which workbook rows record it. Nothing here reads or writes anything.
//
// Matching uses provider identifiers, never subject text alone: the Gmail thread id and the RFC Message-ID / In-Reply-To /
// References headers are matched against the Mail_Events tab, which is the thread index (every automatic send and every
// reconciled manual send is a Mail_Events row with direction out, its job_key and its thread id). The sender address of an
// inbound message is matched against Contacts only as a second, weaker link.
//
// Outcomes per message (Mail_Events.status): applied (rows written), review (a person decides on the Desk, mail_review form),
// ignored (not ours, or already recorded), noted (1.8 rc2: a delivery delay, recorded only). A message linked to a tracked contact or thread becomes exactly one Mail_Events row,
// so a second run never counts it again; a real mailbox lists the same recent messages on every run. Classifications: reply, bounce, opt_out, ooo_auto_reply, manual_sent, conversation_sent (1.10), outbound_in_thread, outbound_other,
// unlinked_inbound, not_tracked (counted, no row), already_recorded (a message already in Mail_Events: counted, no row; a message
//   whose id is on a Queue or Activity row but not yet in Mail_Events: one ignored row that indexes its thread).
//   reply            human reply in a tracked thread: Activity reply row (replied_neutral, sentiment left to the person) with a
//                    Respond task for OWNER; the gate then stops the unsent sequence for that person.
//   bounce           delivery failure for a tracked recipient: Activity bounce row (the gate blocks email for the person).
//   opt_out          an explicit request to stop: Activity opt_out row and a Suppression row (all channels).
//   ooo_auto_reply   an out-of-office auto reply: a pause for that person until a proposed return date (an Activity pause_set row
//                    logged by capture, shown under Needs attention until confirmed); the sequence is not stopped.
//   manual_sent      an email OWNER sent by hand to a tracked contact whose body carries the full reviewed text of exactly one email job of that recipient (1.4), that job unsent and its subject matching
//                    (the job's whole normalized text as one passage of the sent body; its opening or a share of its words is
//                    never enough): the job is marked sent with the provider id, an Activity sent row is written, and the message
//                    becomes the thread index for later replies. Anything else (no full text, the text of two jobs, of a
//                    superseded revision or of a job already sent, or another subject): a review item, and the sender holds
//                    the person until it is resolved on the Desk.
// Uncertain classifications become review items; nothing is guessed.
// 1.8 (3 Oct 2026, audit C-11 and T-08; nothing else changed):
//   opt_out          also when the reply's NEW text (quoted history, quote headers, signature and phone trailers removed;
//                    any total length) is, after a greeting and a sign-off or the sender's name, only an approved phrase
//                    (optOutPhrase, OPTOUT_PHRASES). A phrase inside a longer message is not an opt-out: it takes the
//                    reply path as before. The 1.7 rule (OPTOUT on subject and text under 1500 characters) is kept as it was.
//   delivery_delay   a delivery notice (mailer-daemon sender or delivery subject) that is temporary (the notice's own subject prefix
//                    says Delay, delayed, warning or deferred, or a 4.x.x code, "delayed", "will retry", "temporarily" with no
//                    permanent mark): Mail_Events status noted (rc2): recorded only; no Activity, no Suppression, no stop, and no
//                    hold (the sender, the Desk and the importer read only status review). delivery_unclear: a delivery notice
//                    with neither mark: review (it may be a bounce), no Activity, no Suppression.
//                    rc3: delay words are read only in the notice's own text (never the quoted original), and conflicting
//                    signals (a Failure / Undeliverable / Returned subject, a 4.x.x code next to a permanent mark) give
//                    delivery_unclear (review), never a noted delay.
//   bounce           only a permanent failure (deliveryKind: a 5.x.x code, 550 to 554, "address not found", "does not exist",
//                    "user unknown", "permanent failure" and equivalents); applied and review exactly as in 1.7.
// 1.10 (20 Oct 2026): CONVERSATION EMAILS. A hand-sent email that is not a sequence step, to a tracked person whose account is in an
// active conversation, is recorded automatically with the effects the importer (desk_log 3.11) writes when such an email is resolved
// on the Desk as mail_review / conversation_sent: one Activity row (action mail_review, outcome sent, channel email, direction out,
// no step, no job, no link, to = the first address of the message's To/Cc, provider_message_id = the message id, the importer's note)
// and the Mail_Events row classified conversation_sent. Here the row is status applied with Activity row m<message id> (the capture's
// own convention), so the 1.9 reconciliation, the OR-11 capture-effects check and the sender's capture-effects hold cover it like every
// other applied row. It replaces only two review outcomes of 1.9, AFTER every content and subject test of 1.4 (a body carrying the full
// text of a job, or the subject of an unsent job, stays a review item exactly as before): "no unsent job has this subject" and "no
// unsent email job and no tracked thread". conversationOf decides; whatever it cannot show stays the 1.9 review item, word for word.
//   signal      person level: a human reply (replied_positive, replied_neutral, reply; not one of ours), a phone conversation
//               (connected, connected_<any> except connected_not_interested and connected_wrong_*), or an active meeting of the
//               person (a meeting id with meeting_booked or meeting_held whose latest booked / rescheduled / held / cancelled / no-show
//               entry is not a cancellation or a no-show). Account level adds the same by anyone at the firm, a callback request,
//               an active meeting of the firm and Research partner_stage Conversation or later (never Closed).
//   unsent job  when the person still has unsent email jobs only a person-level signal counts, every such job must already be
//               blocked by the gate (status blocked), and no email job's reviewed text may be 60% or more in the body.
//   never       a Suppression row not cleared for the person (contact scope, channel all, email or empty, any status) or for the firm
//               (account scope); opt_out, bounce, not_interested, declined, no_fit, connected_not_interested or replied_negative on
//               record for the person; Research partner_stage Closed or outreach_eligibility other than eligible; another tracked
//               recipient of the same email that has a job with this subject or text, or does not pass the same test itself.
//               Rows voided by entered_by_mistake never count; a row corrected by outcome_corrected counts as its correction only.
// Inbound mail is unchanged (unlinked_inbound stays a review item; no sentiment is read).
(function (root) {
  'use strict';
  const VERSION = '1.10';
  const s = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  const lc = (v) => s(v).toLowerCase();
  const emailOf = (v) => { const m = s(v).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); return m ? m[0].toLowerCase() : ''; };
  const emailsIn = (v) => Array.from(new Set((s(v).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(x => x.toLowerCase())));
  const normSubject = (v) => lc(v).replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim();
  const rfcIds = (v) => (s(v).match(/<[^>]+>/g) || []).map(x => x.toLowerCase());
  // 1.4: does the sent body carry the WHOLE reviewed text of the job? Both texts are normalized (lower case, every run of
  // punctuation and white space becomes one space) and the job's full text must appear as one contiguous passage of the sent
  // body. Quoted history and the part after "On ... wrote:" are ignored. The opening words, or a share of the words, are never
  // enough: a revision can share its opening and most of its words with the job it replaced.
  const words = (t) => s(t).toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').split(' ').filter(w => w.length >= 3);
  const norm = (t) => ' ' + s(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  function ownText(t) { const keep = []; for (const ln of String(t || '').split(/\r?\n/)) { if (/^\s*>/.test(ln)) continue; if (/^\s*on .{4,120} wrote:\s*$/i.test(ln)) break; keep.push(ln); } return keep.join('\n'); }
  function contentEvidence(jobContent, msgText) {
    const jn = norm(jobContent); if (jn.trim().length < 20) return { strong: false, score: 0, why: 'the job has too little text to compare' };
    const whole = norm(ownText(msgText)).includes(jn);
    const jw = words(jobContent), set = new Set(words(ownText(msgText))); const score = jw.length ? jw.filter(w => set.has(w)).length / jw.length : 0;
    return { strong: whole, score: Math.round(score * 100) / 100, why: whole ? 'the full reviewed text is in the sent body' : 'the full reviewed text is not in the sent body (' + Math.round(score * 100) + '% of its words are)' };
  }
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const ilDay = (d) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (e) { return isoDay(d); } };   // 1.2: a Respond task is due the Israel day the reply was captured
  const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)|delivery.?notification/i;
  const BOUNCE_SUBJ = /delivery status notification|undeliverable|delivery (has )?failed|mail delivery failed|returned mail|failure notice|could not be delivered|address not found/i;
  const OOO_SUBJ = /out of (the )?office|auto(matic)?[\s-]?(reply|response)|autoreply|away from (the |my )?(office|desk)|on (annual |parental |maternity |paternity |sick |medical )?leave|on vacation|abwesenheit|absence/i;
  const OOO_BODY = /out of (the )?office|away from (the |my )?(office|desk)|limited access to (my )?email|will (be )?(back|return)|returning (on|to the office)|on (annual |parental |maternity |paternity |sick |medical )?leave|on vacation|currently (traveling|travelling)/i;
  const OPTOUT = /\bunsubscribe\b|remove me (from|off)|take me off|do not (contact|email|reach out to) me|don'?t (contact|email) me|stop (emailing|contacting|sending)|no (further|more) emails|opt[\s-]?out|please remove|not to be contacted/i;
  // 1.8: the reply's own new text. Lines quoted with ">" are skipped; reading stops at a quote header (Gmail and Apple "On <date>
  // ... wrote:", also when wrapped over up to four lines; Outlook "-----Original Message-----", a line of underscores, a "From:"
  // line followed within six lines by "Sent:" or "Date:"; "---------- Forwarded message ----------", "Begin forwarded message:"),
  // at a signature delimiter ("-- " or "--" alone on a line) and at a phone trailer ("Sent from my iPhone", "Get Outlook for iOS").
  function newText(t) {
    const L = String(t || '').replace(/\r\n?/g, '\n').split('\n'); const keep = [];
    for (let i = 0; i < L.length; i++) {
      const tr = L[i].trim();
      if (/^>/.test(tr)) continue;
      if (/^on\s/i.test(tr)) { let j = i, joined = tr, hit = false; while (j < L.length && j < i + 4) { if (/^on\s.{4,300}\bwrote:\s*$/i.test(joined)) { hit = true; break; } j++; if (j < L.length) joined += ' ' + L[j].trim(); } if (hit) break; }
      if (/^-{2,}\s*original message\s*-{2,}$/i.test(tr) || /^_{8,}$/.test(tr) || /^-{2,}\s*forwarded message\s*-{2,}$/i.test(tr) || /^begin forwarded message:?$/i.test(tr)) break;
      if (/^from:\s/i.test(tr) && L.slice(i + 1, i + 7).some(x => /^\s*(sent|date):\s/i.test(x))) break;
      if (/^--\s*$/.test(L[i])) break;
      if (/^sent from my\s/i.test(tr) || /^(get|sent from) outlook for (ios|android)/i.test(tr)) break;
      keep.push(L[i]);
    }
    return keep.join('\n').trim();
  }
  // 1.8: the approved opt-out phrases, compared after lower-casing, dropping apostrophes and turning every other non-letter, non-digit
  // run into one space. Two approved phrases in a row ("no thanks, not interested") also count.
  const OPTOUT_PHRASES = new Set(['no thanks', 'no thank you', 'not interested', 'im not interested', 'i am not interested', 'we are not interested', 'were not interested',
    'remove me', 'please remove me', 'remove me from your list', 'please remove me from your list', 'remove me from this list', 'please remove me from this list', 'remove me from your mailing list', 'please remove me from your mailing list', 'remove me from your email list', 'please remove me from your email list', 'take me off your list', 'please take me off your list',
    'unsubscribe', 'please unsubscribe', 'unsubscribe me', 'please unsubscribe me', 'stop', 'please stop',
    'do not contact', 'do not contact me', 'please do not contact me', 'dont contact me', 'please dont contact me']);
  const phraseKey = (t) => String(t || '').toLowerCase().replace(/['\u2018\u2019\u02bc`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const isOptOutKey = (k) => { if (OPTOUT_PHRASES.has(k)) return true; for (const a of OPTOUT_PHRASES) if (k.startsWith(a + ' ') && OPTOUT_PHRASES.has(k.slice(a.length + 1))) return true; return false; };
  const SIGNOFF = '(?:thanks(?: (?:a lot|again|so much))?|thank you(?: (?:very much|so much|again))?|many thanks|thx|cheers|best(?: regards| wishes)?|all the best|(?:kind |warm |best )?regards|sincerely|take care)';
  const NAMEN = (n) => "((?:[A-Za-z][A-Za-z'.-]*[ \\t]+){" + (n - 1) + "}[A-Za-z][A-Za-z'.-]*)";   // exactly n words on one line
  const STRIP_SIGNOFF = new RegExp('^([\\s\\S]*?)[\\s,.;:!-]+' + SIGNOFF + '[\\s,.;:!-]*$', 'i');
  // a name after a sign-off: after a comma, a dash, a space or a line break, never after a full stop on the same line ("No thanks. Call Bob" keeps "Call Bob")
  const STRIP_NAME_AFTER_SIGNOFF = [1, 2, 3].map(n => new RegExp('^([\\s\\S]*?\\b' + SIGNOFF + ')(?:[ \\t]*[,;:-][ \\t]*|[ \\t]+|[ \\t]*[,.!;:-]?[ \\t]*\\n\\s*)' + NAMEN(n) + '[\\s.!]*$', 'i'));
  const STRIP_NAME = [1, 2, 3].map(n => new RegExp('^([\\s\\S]*?)[\\s,.;:!-]+' + NAMEN(n) + '[\\s.!]*$', 'i'));
  // the whole new text is only an approved phrase (with a greeting, a sign-off and a name around it): returns the phrase, else ''.
  // contact: the Contacts row of the linked person. A name after a sign-off ("Thanks, Bob") may be any capitalised name of up to
  // three words; a name with no sign-off before it ("No thanks - Chris") counts only when it is that person's own name or initials.
  function optOutPhrase(text, contact) {
    const t = newText(text).replace(/[\u2013\u2014]/g, '-'); if (!t || t.length > 300) return '';
    const own = new Set(phraseKey(contact && contact.full_name).split(' ').filter(Boolean));
    const nameOk = (n, afterSignoff) => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); if (!w.length || w.length > 3) return false; return w.every(x => (afterSignoff && /^[A-Z][A-Za-z'.-]*$/.test(x)) || (phraseKey(x) && own.has(phraseKey(x))) || /^[A-Z]\.?$/.test(x)); };
    // a greeting: "Hi OWNER," "Hello," "Dear Mr OWNER_SURNAME:" (a name of up to two words needs punctuation or a line end after it,
    // except OWNER, OWNER_SURNAME, there, all, team, everyone)
    const g = t.replace(/^(?:hi|hello|hey|dear|greetings|good (?:morning|afternoon|evening))(?:\s+[A-Za-z][A-Za-z.'-]*){0,2}\s*(?:[,!:;.]+|\n)\s*/i, '').replace(/^(?:hi|hello|hey|dear)(?:\s+(?:mr\.?|owner_first|owner_last|there|all|team|everyone)){1,2}\s+/i, '').replace(/^owner_first\s*[,!:;\n]\s*/i, '');
    const seen = new Set(); const todo = [t, g].map(x => x.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim());
    while (todo.length && seen.size < 40) {
      const x = todo.shift(); if (!x || seen.has(x)) continue; seen.add(x);
      if (isOptOutKey(phraseKey(x))) return phraseKey(x);
      let m = x.match(STRIP_SIGNOFF); if (m) todo.push(m[1].trim());
      for (const re of STRIP_NAME_AFTER_SIGNOFF) { m = x.match(re); if (m && nameOk(m[2], !isOptOutKey(phraseKey(m[1])))) todo.push(m[1].trim()); }   // rc2 (P5): when the "sign-off" ends the phrase itself ("No thanks, Monday works"), only the contact's own name or initials may follow
      for (const re of STRIP_NAME) { m = x.match(re); if (m && nameOk(m[2], false)) todo.push(m[1].trim()); }
    }
    return '';
  }
  // 1.8: a delivery notice is a bounce only for a permanent failure. Status codes are read only when not part of a longer dotted
  // number (an IP address). rc3: words are read only in the notice's own text (dsnOwnText: cut at the quoted original message, an
  // attached copy or an "Original message" / From-Subject header block; our own email may say "delayed"), a 5.x.x or 550 to 554 code
  // anywhere. Conflicting signals give 'unclear' (a review item), never a delay: a permanent mark with a Delay subject or a 4.x.x
  // code, a Failure / Undeliverable / Returned / failed subject with a Delay subject, a 4.x.x code or no permanent mark.
  const DSN_PERM = /(?<![\d.])5\.\d{1,3}\.\d{1,3}(?![\d.])|(?<![\d.])55[0-4](?![\d.])|address not found|(?:does not|doesn'?t|did not) exist|no longer exists|user unknown|unknown user|no such (?:user|recipient|mailbox|address)|recipient (?:address )?rejected|recipientnotfound|recipient not found|mailbox (?:unavailable|not found|does not exist)|invalid recipient|wasn'?t found|was not found|could(?:n'?t| not) be found|no longer accepts? (?:mail|messages|email)|permanent(?:ly)? (?:failure|failed|error|fatal|rejected)|permanent failure|fatal error/i;
  const DSN_TEMP = /(?<![\d.])4\.\d{1,3}\.\d{1,3}(?![\d.])|\bdelay(?:ed)?\b|will (?:retry|be retried|keep trying|continue (?:trying|to try))|temporar(?:y|ily)|\bdeferred\b|not yet (?:been )?delivered|still trying|try again later/i;
  const DSN_TEMP_SUBJ = /^\s*(?:[^:]*\(delay\)|(?:warning|delayed mail|delivery delayed|message delayed|delay(?:ed)?|deferred)\b|delivery (?:status notification )?\(?delay)/i;   // rc2 (P6): only the notice's own prefix, never the original subject it quotes
  const DSN_CODE5 = /(?<![\d.])5\.\d{1,3}\.\d{1,3}(?![\d.])|(?<![\d.])55[0-4](?![\d.])/;
  const DSN_CODE4 = /(?<![\d.])4\.\d{1,3}\.\d{1,3}(?![\d.])/;
  const DSN_FAIL_SUBJ = /\(failure\)|undeliverable|undelivered|returned (?:mail|to sender)|delivery (?:has )?failed|mail delivery failed|delivery failure|failure notice|could not be delivered|address not found|\bfailed\b|\brejected\b/i;
  const DSN_CUT = [/^\s*-*\s*(?:original message|forwarded message|begin forwarded message|original message headers)\b/im, /^.*\b(?:this is a copy of the (?:original )?message|below this line is a copy of the message|a copy of the original message)\b.*$/im, /^\s*content-type:\s*message\/rfc822/im, /^\s*\[?(?:attachment|attached message)\b/im, /^\s*(?:from|subject):\s.*\n(?:.*\n){0,5}?\s*(?:subject|sent|date|to):\s/im];
  function dsnOwnText(body) { let cut = body.length; for (const re of DSN_CUT) { const m = re.exec(body); if (m && m.index < cut) cut = m.index; } return body.slice(0, cut); }
  function deliveryKind(msg) {
    const subj = s(msg.subject), body = s(msg.text), own = dsnOwnText(body), mine = subj + '\n' + own;
    const pm = mine.match(DSN_PERM) || body.match(DSN_CODE5); const c4 = mine.match(DSN_CODE4); const subjTemp = DSN_TEMP_SUBJ.test(subj); const subjFail = DSN_FAIL_SUBJ.test(subj); const tm = own.match(DSN_TEMP);
    if (pm && (subjTemp || c4)) return { kind: 'unclear', why: 'conflicting signals: permanent failure ("' + pm[0] + '") and ' + (subjTemp ? 'a delay subject' : 'a temporary code ("' + c4[0] + '")') };
    if (pm) return { kind: 'permanent', why: 'permanent failure ("' + pm[0] + '")' };
    if (subjTemp && subjFail) return { kind: 'unclear', why: 'the subject says both delayed and failed ("' + subj.slice(0, 80) + '")' };
    if (subjTemp) return { kind: 'temporary', why: 'the subject says the delivery is delayed ("' + subj.slice(0, 80) + '")' };
    if (subjFail) return { kind: 'unclear', why: 'the subject says the delivery failed ("' + subj.slice(0, 80) + '") ' + (c4 ? 'but the code is temporary ("' + c4[0] + '")' : 'and no permanent failure code or wording was found') };
    if (tm) return { kind: 'temporary', why: 'a temporary delivery problem ("' + tm[0] + '") in the notice\'s own text, no permanent failure code' };
    return { kind: 'unclear', why: 'no permanent failure code or wording in the notice' };
  }

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  // 1.7: the return date of an out-of-office message. Reads only the message's own text (quoted history after "On ... wrote:" and ">"
  // lines dropped) and the subject. A date counts as the return only after a return keyword: return(ing)/back/in the office/until/
  // till give the return day itself, through/thru give the next weekday after it. Forms: "October 6", "6 October", "10/6" (month/day
  // for a US or Canadian recipient, or when the country is unknown; elsewhere ambiguous unless one part is over 12), each optionally
  // preceded by a weekday, which must match the date. A weekday alone ("back Monday") or a range ("10/1-10/6") is a proposal only.
  // certainty: 'clear' (exactly one return day, nothing contradicts it), 'ambiguous' (several days, a weekday that does not match, a
  // day-month order that cannot be told, a weekday-only or range proposal, or a date in the past) or 'missing' (no return date).
  const WDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const WD_RE = '(?:(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\\.?,?\\s+(?:the\\s+)?)';
  const KW_RE = '(return(?:ing|s)?(?:\\s+to\\s+(?:the\\s+)?(?:office|work))?|back(?:\\s+in\\s+(?:the\\s+)?office)?(?:\\s+to\\s+(?:the\\s+)?office)?|in\\s+the\\s+office|until|till|til|through|thru)(?:\\s+(?:on|by|as\\s+of))?\\s+';
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  const wdIdx = (w) => w ? WDAYS[String(w).slice(0, 3).toLowerCase()] : undefined;
  const usStyle = (contact) => { const c = lc(contact && contact.country); return !c || /^(us|usa|u\.s\.a?\.?|united states( of america)?|america|ca|canada)$/.test(c); };
  function oooReturn(text0, msgDate, contact) {
    const t = ownText(String(text0 || '')).split(String.fromCharCode(8211)).join('-').split(String.fromCharCode(8212)).join('-').replace(/<mailto:[^>]*>/gi, ' ').replace(/\s+/g, ' ');   // en and em dashes read as hyphens
    const y0 = msgDate.getUTCFullYear(); const lo = msgDate.getTime() - 864e5, hi = msgDate.getTime() + 120 * 864e5;
    const cands = []; const notes = [];
    const mk = (y, m, d) => { const dt = new Date(Date.UTC(y, m, d)); return (dt.getUTCMonth() === m && dt.getUTCDate() === d) ? dt : null; };
    const withYear = (yy, m, d) => { if (yy) { const y = +yy < 100 ? 2000 + +yy : +yy; return mk(y, m, d); } let dt = mk(y0, m, d); if (dt && dt.getTime() < lo) dt = mk(y0 + 1, m, d); return dt; };
    const nextWd = (dt) => { const x = new Date(dt.getTime() + 864e5); while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x.setUTCDate(x.getUTCDate() + 1); return x; };
    const add = (kw, wd, dt, quote, extra) => {
      if (!dt) return; const through = /^(through|thru)/i.test(kw);
      const day = through ? nextWd(dt) : dt; const c = Object.assign({ date: day, quote: quote.trim(), via: through ? 'through' : 'return' }, extra || {});
      if (wd !== undefined && dt.getUTCDay() !== wd) { c.conflict = 'the weekday named does not match ' + isoDay(dt); }
      if (day.getTime() < lo) c.past = true; else if (day.getTime() > hi) c.far = true;
      cands.push(c);
    };
    let m;
    const reA = new RegExp('\\b' + KW_RE + WD_RE + '?' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?', 'gi');
    while ((m = reA.exec(t))) { const mo = MONTHS[m[3].slice(0, 3).toLowerCase()]; if (mo === undefined) continue; add(m[1], wdIdx(m[2]), withYear(m[5], mo, +m[4]), m[0]); }
    const reB = new RegExp('\\b' + KW_RE + WD_RE + '?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '\\b(?:,?\\s+(\\d{4}))?', 'gi');
    while ((m = reB.exec(t))) { const mo = MONTHS[m[4].slice(0, 3).toLowerCase()]; if (mo === undefined) continue; add(m[1], wdIdx(m[2]), withYear(m[5], mo, +m[3]), m[0]); }
    const reC = new RegExp('\\b' + KW_RE + WD_RE + '?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?!\\s*-\\s*\\d)\\b', 'gi');
    while ((m = reC.exec(t))) {
      const a = +m[3], b = +m[4]; const us = usStyle(contact);
      if (us) { add(m[1], wdIdx(m[2]), withYear(m[5], a - 1, b), m[0]); continue; }
      if (a > 12 && b <= 12) { add(m[1], wdIdx(m[2]), withYear(m[5], b - 1, a), m[0]); continue; }
      if (b > 12 && a <= 12) { add(m[1], wdIdx(m[2]), withYear(m[5], a - 1, b), m[0]); continue; }
      if (a === b) { add(m[1], wdIdx(m[2]), withYear(m[5], a - 1, b), m[0]); continue; }
      const d1 = withYear(m[5], a - 1, b), d2 = withYear(m[5], b - 1, a); const wd = wdIdx(m[2]);
      const fit = [d1, d2].filter(d => d && (wd === undefined || d.getUTCDay() === wd));
      if (fit.length === 1 && wd !== undefined) add(m[1], wd, fit[0], m[0]); else { notes.push('"' + m[0].trim() + '" can be read as ' + [d1, d2].filter(Boolean).map(isoDay).join(' or ') + ' (day and month order unknown for a recipient in ' + s(contact && contact.country) + ')'); add(m[1], undefined, d1, m[0], { order: true }); add(m[1], undefined, d2, m[0], { order: true }); }
    }
    // a weekday with no date ("back Monday", "returning on Tuesday"): the next such day after the message, as a proposal only
    const reD = new RegExp('\\b' + KW_RE + '(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\\b(?![,.]?\\s*(?:\\d|' + MONTH_RE + '|the\\s+\\d))', 'gi');
    while ((m = reD.exec(t))) { const wd = wdIdx(m[2]); const x = new Date(Date.UTC(msgDate.getUTCFullYear(), msgDate.getUTCMonth(), msgDate.getUTCDate() + 1)); while (x.getUTCDay() !== wd) x.setUTCDate(x.getUTCDate() + 1); cands.push({ date: x, quote: m[0].trim(), via: 'weekday', proposal: true }); }
    // a range with no keyword ("out 10/1 - 10/6", "Oct 1-6"): the last day of the range is the last day away; a proposal only
    const reR = /\b(\d{1,2})\/(\d{1,2})\s*(?:-|to|through|thru|until)\s*(\d{1,2})\/(\d{1,2})\b/gi;
    while ((m = reR.exec(t))) { if (!usStyle(contact)) continue; const end = withYear('', +m[3] - 1, +m[4]); if (end) cands.push({ date: nextWd(end), quote: m[0].trim(), via: 'range', proposal: true }); }
    const valid = cands.filter(c => !c.past && !c.far);
    const days = Array.from(new Set(valid.map(c => isoDay(c.date))));
    const firm = valid.filter(c => !c.proposal && !c.conflict && !c.order);
    const firmDays = Array.from(new Set(firm.map(c => isoDay(c.date))));
    const quote = (valid[0] || cands[0] || {}).quote || '';
    if (firmDays.length === 1 && days.length === 1) return { certainty: 'clear', date: firm[0].date, day: firmDays[0], quote: firm[0].quote, via: firm[0].via, candidates: days, why: 'return date read from "' + firm[0].quote + '"' };
    if (!cands.length) return { certainty: 'missing', date: null, day: '', quote: '', candidates: [], why: 'no return date in the message' };
    const why = [];
    if (cands.some(c => c.past)) why.push('a date before the message (' + cands.filter(c => c.past).map(c => '"' + c.quote + '"').join(', ') + ')');
    if (valid.some(c => c.conflict)) why.push(valid.filter(c => c.conflict).map(c => '"' + c.quote + '": ' + c.conflict).join('; '));
    if (notes.length) why.push(notes.join('; '));
    if (valid.some(c => c.proposal)) why.push(valid.filter(c => c.proposal).map(c => '"' + c.quote + '" ' + (c.via === 'weekday' ? 'names a weekday, not a date' : 'is a range') + ' (proposed return ' + isoDay(c.date) + ')').join('; '));
    if (firmDays.length > 1) why.push('several return dates (' + firmDays.join(', ') + ')');
    const prop = days.length === 1 ? valid[0].date : null;
    return { certainty: 'ambiguous', date: null, proposal: prop, day: prop ? isoDay(prop) : '', quote, candidates: days, why: why.join('; ') || 'several readings (' + days.join(', ') + ')' };
  }
  const excerptOf = (text) => ownText(String(text || '')).replace(/<mailto:[^>]*>/gi, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  // A date mentioned as a return (1.6, kept for compatibility; 1.7 classifies with oooReturn): "back on Monday, October 5", "return to the office October 5th", "until 5 October", "10/05/2026"
  function returnDatesIn(text, msgDate) {
    const t = s(text).replace(/\s+/g, ' '); const y0 = msgDate.getUTCFullYear(); const found = [];
    const push = (y, m, d) => { const dt = new Date(Date.UTC(y, m, d)); if (!isNaN(dt) && dt.getTime() >= msgDate.getTime() - 864e5 && dt.getTime() < msgDate.getTime() + 120 * 864e5) found.push(dt); };
    let m; const re1 = /\b(?:on|until|till|through|thru|after|return(?:ing)?(?: to the office)?(?: on)?|back(?: in the office)?(?: on)?|from)\s+(?:[A-Za-z]+day,?\s+)?(?:the\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/gi;
    while ((m = re1.exec(t))) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo === undefined || (m[1].length > 3 && !/^(january|february|march|april|may|june|july|august|september|sept|october|november|december)$/i.test(m[1]))) continue; let y = m[3] ? +m[3] : y0; if (!m[3] && mo < msgDate.getUTCMonth() - 1) y = y0 + 1; push(y, mo, +m[2]); }
    const re2 = /\b(?:on|until|till|through|thru|after|return(?:ing)?(?: to the office)?(?: on)?|back(?: in the office)?(?: on)?|from)\s+(?:[A-Za-z]+day,?\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/gi;
    while ((m = re2.exec(t))) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo === undefined) continue; let y = m[3] ? +m[3] : y0; if (!m[3] && mo < msgDate.getUTCMonth() - 1) y = y0 + 1; push(y, mo, +m[1]); }
    const re3 = /\b(?:on|until|till|through|thru|after|return(?:ing)?(?: on)?|back(?: on)?)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/gi;
    while ((m = re3.exec(t))) { let y = m[3] ? +m[3] : y0; if (y < 100) y += 2000; push(y, +m[1] - 1, +m[2]); }
    const uniq = []; for (const d of found.sort((a, b) => a - b)) if (!uniq.some((u) => u.getTime() === d.getTime())) uniq.push(d); return uniq;
  }
  function returnDateFrom(text, msgDate) { const all = returnDatesIn(text, msgDate); return all.length ? all[all.length - 1] : null; }   // the latest date mentioned is the return (an "until" range ends there)
  // 1.6: the instant the return day starts for the recipient: local midnight of the return date in the recipient's time zone, read from
  // the Contacts row by the schedule engine's own rule (workflow/schedule.js tzOf: city and state, country, Eastern assumed when
  // nothing is on the row). Before any window of the return day and after every window of the day before, in that zone. When the
  // engine is not loaded next to this module the 1.5 rule stands (12:00Z on the return date).
  function pauseStartOf(rd, contact) {
    const S = root.BlocksSchedule; const day = isoDay(rd);
    if (S && typeof S.tzOf === 'function' && typeof S.zonedTime === 'function') { const z = S.tzOf(contact || {}); return { at: S.zonedTime(day, '00:00', z.tz).toISOString(), tz: z.tz, basis: z.basis + (z.assumed ? ' (assumed)' : '') }; }
    return { at: day + 'T12:00:00.000Z', tz: 'UTC', basis: '12:00Z on the return date (schedule engine not loaded)' };
  }
  function nextWeekday(d) { const x = new Date(d.getTime()); while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x.setUTCDate(x.getUTCDate() + 1); return x; }
  function isAuto(msg) {
    const h = msg.headers || {}; const as = lc(h['auto-submitted'] || h['Auto-Submitted']); const prec = lc(h.precedence || h.Precedence);
    return (as && as !== 'no') || /auto_reply|auto-reply|bulk|junk/.test(prec) || !!(h['x-autoreply'] || h['X-Autoreply'] || h['x-auto-response-suppress'] || h['X-Auto-Response-Suppress']);
  }
  function buildCtx(tabs, cfg) {
    const rows = (t) => (tabs[t] || []).filter(r => r && !/^template$/i.test(s(r.activity_id || r.event_id || r.message_id || r.job_key)));
    const ctx = { sender: lc(cfg.sender_address), contactsByEmail: {}, contacts: {}, threads: {}, byRfc: {}, seen: new Set(), inboundThreads: new Set(), providerIds: new Set(), jobsByPerson: {}, activityRows: rows('Activity'), suppression: rows('Suppression') };
    for (const c of rows('Contacts')) { const e = emailOf(c.email); const key = s(c.contact_key); if (key) ctx.contacts[key] = c; if (e && key) ctx.contactsByEmail[e] = c; }
    ctx.domains = {}; const FREE = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|icloud|me|aol|proton|protonmail|gmx|zoho)\./;
    for (const q of rows('Queue')) { const d = (emailOf(q.to).split('@')[1] || ''); if (d && !FREE.test(d) && s(q.company_key)) ctx.domains[d] = s(q.company_key); }
    ctx.providerRows = {};
    for (const q of rows('Queue')) { if (s(q.provider_message_id)) { ctx.providerIds.add(s(q.provider_message_id)); ctx.providerRows[s(q.provider_message_id)] = q; } const pk = s(q.apollo_person_id) || s(q.contact_key); if (pk) (ctx.jobsByPerson[pk] = ctx.jobsByPerson[pk] || []).push(q); }
    for (const a of ctx.activityRows) if (s(a.provider_message_id)) { ctx.providerIds.add(s(a.provider_message_id)); if (!ctx.providerRows[s(a.provider_message_id)]) ctx.providerRows[s(a.provider_message_id)] = a; }
    for (const m of rows('Mail_Events')) {
      ctx.seen.add(s(m.message_id));
      if (s(m.thread_id) && lc(m.direction) === 'out' && s(m.contact_key)) (ctx.threads[s(m.thread_id)] = ctx.threads[s(m.thread_id)] || []).push(m);
      for (const id of rfcIds(m.rfc_message_id)) ctx.byRfc[id] = m;
      if (s(m.thread_id) && lc(m.direction) === 'in' && !/^(ignored|noted)$/i.test(s(m.status))) ctx.inboundThreads.add(s(m.thread_id));   // rc2: a noted delay notice is not a message from the person
    }
    ctx.research = {}; for (const r of rows('Research')) if (s(r.company_key)) ctx.research[s(r.company_key)] = r;   // 1.10: partner_stage and outreach_eligibility per firm
    return ctx;
  }
  const personFrom = (c) => c ? { company_key: s(c.domain), contact_key: s(c.contact_key), apollo_person_id: s(c.apollo_person_id), name: s(c.full_name) } : null;
  // The link of an inbound message: the tracked thread it belongs to (strong), else the contact whose address sent it (weak)
  function linkOf(msg, ctx) {
    const th = ctx.threads[s(msg.thread_id)]; if (th && th.length) { const o = th[th.length - 1]; const c = ctx.contacts[s(o.contact_key)]; return Object.assign({ via: 'thread', job_key: s(o.job_key) }, personFrom(c) || { company_key: s(o.company_key), contact_key: s(o.contact_key), apollo_person_id: s(o.apollo_person_id), name: '' }); }
    const h = msg.headers || {}; const refs = rfcIds((h['in-reply-to'] || h['In-Reply-To'] || '') + ' ' + (h.references || h.References || ''));
    for (const id of refs) { const o = ctx.byRfc[id]; if (o && lc(o.direction) === 'out' && s(o.contact_key)) { const c = ctx.contacts[s(o.contact_key)]; return Object.assign({ via: 'references', job_key: s(o.job_key) }, personFrom(c) || { company_key: s(o.company_key), contact_key: s(o.contact_key), apollo_person_id: s(o.apollo_person_id), name: '' }); } }
    const c = ctx.contactsByEmail[emailOf(msg.from)]; if (c) return Object.assign({ via: 'address', job_key: '' }, personFrom(c));
    return null;
  }
  // 1.10: is this hand-sent email a conversation email? person: personFrom(contact); opts: { jobs: the person's unsent email jobs,
  // all: every email job of the person, text: the sent body }. Returns { ok, level, why }; ok false keeps the 1.9 review item.
  const CONV_STAGES = ['Conversation', 'Meeting booked', 'Meeting held', 'Agreement sent', 'Signed', 'Activated', 'First introduction'];
  const CONV_REPLY = /^(replied_positive|replied_neutral|reply)$/i;
  const CONV_TALK = /^connected(?:_(?!not_interested$|wrong_)\w+)?$/i;
  const CONV_CALLBACK = /^callback_requested$/i;
  const CONV_NEVER = /^(opt_?out|bounce|not_interested|declined|no_fit|connected_not_interested|replied_negative)$/i;
  const MEET_LIFE = /^meeting_(booked|rescheduled|held|cancelled|no_show)$/i;
  function correctedOutcome(notes) {
    const t = s(notes); const i = t.indexOf('[correct {'); if (i < 0) return '';
    for (let j = t.indexOf('}]', i); j > 0; j = t.indexOf('}]', j + 1)) { try { return s(JSON.parse(t.slice(i + 9, j + 1)).outcome); } catch (e) { } }
    return '';
  }
  function conversationOf(person, ctx, opts) {
    const o = opts || {}; const jobs = o.jobs || [];
    const pk = s(person && person.apollo_person_id), ck = s(person && person.contact_key), co = s(person && person.company_key);
    const no = (why) => ({ ok: false, level: '', why });
    const mine = (r) => (pk && s(r.apollo_person_id) === pk) || (ck && s(r.contact_key) === ck);
    for (const r of ctx.suppression || []) {
      if (s(r.cleared_at)) continue; const acct = /^account$/i.test(s(r.scope));
      if (acct ? (co && s(r.company_key) === co) : (mine(r) && /^(all|email|)$/i.test(s(r.channel)))) return no('a Suppression row is on file (' + (acct ? 'account, ' : '') + s(r.channel) + '/' + s(r.status) + ')');
    }
    const R = (ctx.research || {})[co] || null;
    if (R && /^closed$/i.test(s(R.partner_stage))) return no('the account is Closed');
    if (R && s(R.outreach_eligibility) && !/^eligible$/i.test(s(R.outreach_eligibility))) return no('the account is not eligible (' + s(R.outreach_eligibility) + ')');
    const rows = ctx.activityRows || [];
    const voided = new Set(rows.filter(a => /^(entered_by_mistake|voided)$/i.test(s(a.outcome))).map(a => s(a.link_id)).filter(Boolean));
    const corrected = {}; for (const a of rows) if (/^outcome_corrected$/i.test(s(a.outcome)) && s(a.link_id)) corrected[s(a.link_id)] = correctedOutcome(a.notes);
    const live = [];
    for (const a of rows) { const id = s(a.activity_id); if (voided.has(id) || /^(entered_by_mistake|voided|outcome_corrected)$/i.test(s(a.outcome))) continue; live.push(id && id in corrected ? Object.assign({}, a, { outcome: corrected[id] }) : a); }
    const firm = co ? live.filter(a => s(a.company_key) === co) : []; const own = live.filter(mine);
    const bad = own.find(a => CONV_NEVER.test(s(a.outcome)));
    if (bad) return no('the person has ' + s(bad.outcome) + ' on record (' + s(bad.activity_id) + ')');
    const t = (a) => Date.parse(s(a.ts)) || Date.parse(s(a.logged_at)) || 0;
    const meet = {}; const unlinkedEnd = [];
    for (const a of firm) {
      const oc = lc(a.outcome); if (!MEET_LIFE.test(oc)) continue; const k = s(a.link_id);
      if (!k) { if (/cancelled|no_show/.test(oc)) unlinkedEnd.push(t(a)); continue; }   // a cancellation naming no meeting ends every meeting of the firm before it
      const M = meet[k] = meet[k] || { id: k, booked: false, last: null, people: new Set() };
      if (/booked|held/.test(oc)) M.booked = true; if (!M.last || t(a) >= t(M.last)) M.last = a;
      if (s(a.contact_key)) M.people.add(s(a.contact_key)); if (s(a.apollo_person_id)) M.people.add(s(a.apollo_person_id));
    }
    const active = Object.values(meet).filter(M => M.booked && !/cancelled|no_show/i.test(s(M.last.outcome)) && !unlinkedEnd.some(x => x >= t(M.last)));
    const sig = (a) => (CONV_REPLY.test(s(a.outcome)) && !/^out$/i.test(s(a.direction))) || CONV_TALK.test(s(a.outcome));
    const label = (a) => s(a.outcome) + ' ' + s(a.ts).slice(0, 10);
    const pAct = own.filter(sig).sort((a, b) => t(b) - t(a))[0];
    const pMeet = active.find(M => (ck && M.people.has(ck)) || (pk && M.people.has(pk)));
    const personal = pAct ? 'their ' + label(pAct) : pMeet ? 'their meeting ' + pMeet.id + ' (' + label(pMeet.last) + ')' : '';
    if (jobs.length) {
      if (!personal) return no('unsent email jobs and no reply, phone conversation or active meeting of this person');
      const open = jobs.filter(q => !/^blocked$/i.test(s(q.status)));
      if (open.length) return no('unsent job(s) the gate has not blocked: ' + open.map(q => s(q.step) + ' (' + (s(q.status) || 'no status') + ')').join(', '));
      const near = (o.all || []).map(q => ({ q, e: contentEvidence(q.content, o.text) })).filter(x => x.e.score >= 0.6);
      if (near.length) return no('the body carries most of the text of ' + near.map(x => s(x.q.step) + ' (' + Math.round(x.e.score * 100) + '%)').join(', '));
      return { ok: true, level: 'person', why: personal };
    }
    if (personal) return { ok: true, level: 'person', why: personal };
    const fAct = firm.filter(a => sig(a) || CONV_CALLBACK.test(s(a.outcome))).sort((a, b) => t(b) - t(a))[0];
    if (fAct) return { ok: true, level: 'account', why: 'the firm\'s ' + label(fAct) + (s(fAct.contact_key) ? ' (' + s(fAct.contact_key) + ')' : '') };
    if (active.length) return { ok: true, level: 'account', why: 'the firm\'s meeting ' + active[0].id + ' (' + label(active[0].last) + ')' };
    if (R && CONV_STAGES.includes(s(R.partner_stage))) return { ok: true, level: 'account', why: 'Research partner_stage ' + s(R.partner_stage) };
    return no('no reply, phone conversation, callback request, active meeting or conversation stage on record for the account');
  }
  function classify(msg, ctx, now) {
    const id = s(msg.message_id); const when = new Date(s(msg.date) || now); const text = s(msg.subject) + '\n' + s(msg.text).slice(0, 4000);
    const out = (classification, status, reason, link, extra) => Object.assign({ classification, status, reason, link: link || null, confidence: status === 'applied' ? 'high' : status === 'review' ? 'low' : '' }, extra || {});
    if (ctx.seen.has(id)) return out('already_recorded', 'ignored', 'this message id is already in Mail_Events');
    if (ctx.providerIds.has(id)) { const q = ctx.providerRows[id] || {}; const c = ctx.contacts[s(q.contact_key)]; return out('already_recorded', 'ignored', 'this message id is already on a Queue or Activity row (recorded by the sender or by hand); indexed here once so replies in its thread link', Object.assign({ via: 'provider_id', job_key: s(q.job_key) }, personFrom(c) || { company_key: s(q.company_key), contact_key: s(q.contact_key), apollo_person_id: s(q.apollo_person_id), name: '' })); }
    const from = emailOf(msg.from); const outbound = !!ctx.sender && from === ctx.sender;
    if (outbound) {
      const to = emailsIn(msg.to).filter(e => e !== ctx.sender); const c = to.map(e => ctx.contactsByEmail[e]).find(Boolean);
      if (!c) return out('outbound_other', 'ignored', 'sent by hand to an address that is not a tracked contact');
      const p = personFrom(c); const pk = p.apollo_person_id || p.contact_key;
      const jobs = (ctx.jobsByPerson[pk] || ctx.jobsByPerson[p.contact_key] || []).filter(q => lc(q.channel) === 'email' && !/^(sent|cancel)/i.test(s(q.status)) && !s(q.sent_at) && !s(q.provider_message_id));
      if (ctx.threads[s(msg.thread_id)] && ctx.inboundThreads.has(s(msg.thread_id))) return out('outbound_in_thread', 'applied', 'your reply in a tracked thread with ' + p.contact_key + ' after their message (recorded; no outreach touch)', Object.assign({ via: 'thread', job_key: '' }, p));
      // 1.4: every email job of this person counts as a candidate (unsent, sent, cancelled or superseded revisions), so a text that
      // also belongs to another job can never be attributed to one of them. A job is marked sent only when exactly one candidate's
      // full text is in the body, that candidate is unsent, and its subject matches; anything else stays in review.
      const all = (ctx.jobsByPerson[pk] || ctx.jobsByPerson[p.contact_key] || []).filter(q => lc(q.channel) === 'email');
      const subjOk = (q) => lc(q.subject).replace(/\s+/g, ' ') === lc(msg.subject).replace(/\s+/g, ' ') || normSubject(q.subject) === normSubject(msg.subject);
      const ev = all.map(q => ({ q, e: contentEvidence(q.content, msg.text) })); const whole = ev.filter(x => x.e.strong);
      const unsent = (q) => jobs.includes(q); const label = (q) => s(q.step) + ' ' + s(q.job_key) + ' (' + (unsent(q) ? 'unsent' : s(q.status) || 'sent') + ')';
      const hold = ' Automatic sending to this person is held until then';
      if (whole.length === 1 && unsent(whole[0].q) && subjOk(whole[0].q)) { const q = whole[0].q; return out('manual_sent', 'applied', 'sent by hand: matches the unsent ' + s(q.step) + ' job ' + s(q.job_key) + ' of ' + p.contact_key + ' by recipient, subject and content (' + whole[0].e.why + '; no other job of this person matches)', Object.assign({ via: 'address', job_key: s(q.job_key) }, p), { job: q }); }
      if (whole.length > 1) return out('manual_sent', 'review', 'sent by hand to ' + p.contact_key + ': the body carries the full text of more than one job (' + whole.map(x => label(x.q)).join(', ') + '), so it cannot be attributed to one: choose the job it was, or ignore it.' + hold, Object.assign({ via: 'address', job_key: '' }, p));
      if (whole.length === 1 && !unsent(whole[0].q)) return out('manual_sent', 'review', 'sent by hand to ' + p.contact_key + ': the body is the text of ' + label(whole[0].q) + ', which is not an unsent reviewed job (a superseded revision or one already sent): choose the job it was, or ignore it.' + hold, Object.assign({ via: 'address', job_key: '' }, p));
      if (whole.length === 1) return out('manual_sent', 'review', 'sent by hand to ' + p.contact_key + ': the body is the text of ' + label(whole[0].q) + ' but the subject "' + s(msg.subject).slice(0, 80) + '" is not that job\'s subject: choose the job it was, or ignore it.' + hold, Object.assign({ via: 'address', job_key: '' }, p));
      const exactS = jobs.filter(q => lc(q.subject).replace(/\s+/g, ' ') === lc(msg.subject).replace(/\s+/g, ' ')); const same = exactS.length ? exactS : jobs.filter(q => normSubject(q.subject) === normSubject(msg.subject));
      if (same.length) return out('manual_sent', 'review', 'sent by hand to ' + p.contact_key + ' with the subject of ' + same.map(q => s(q.step) + ' (' + s(q.job_key) + ', ' + ev.find(x => x.q === q).e.why + ')').join(', ') + ', but the body does not carry the full reviewed text of exactly one job: choose the job it was, or ignore it.' + hold, Object.assign({ via: 'address', job_key: '' }, p));
      // 1.10: a conversation email (conversationOf). Every tracked recipient must pass: a co-recipient with a job of this subject or
      // text, or one that fails the test itself, keeps the 1.9 review item unchanged.
      const convOf = () => {
        const done = new Set(); let first = null;
        for (const cc of to.map(e => ctx.contactsByEmail[e]).filter(Boolean)) {
          const pp = personFrom(cc); if (done.has(pp.contact_key)) continue; done.add(pp.contact_key);
          const pk2 = pp.apollo_person_id || pp.contact_key; const all2 = (ctx.jobsByPerson[pk2] || ctx.jobsByPerson[pp.contact_key] || []).filter(q => lc(q.channel) === 'email');
          const jobs2 = all2.filter(q => !/^(sent|cancel)/i.test(s(q.status)) && !s(q.sent_at) && !s(q.provider_message_id));
          if (cc !== c && (jobs2.some(subjOk) || all2.some(q => contentEvidence(q.content, msg.text).strong))) return { ok: false, why: 'another recipient, ' + pp.contact_key + ', has a job with this subject or text' };
          const r = conversationOf(pp, ctx, { jobs: jobs2, all: all2, text: msg.text });
          if (!r.ok) return { ok: false, why: (cc === c ? '' : 'another recipient, ' + pp.contact_key + ': ') + r.why };
          if (!first) first = r;
        }
        return first || { ok: false, why: 'no tracked recipient' };
      };
      const conversation = (cv) => out('conversation_sent', 'applied', 'sent by hand to ' + p.contact_key + ': a conversation email, not a sequence step (' + cv.why + (jobs.length ? '; no unsent job has this subject or its text, and the gate already blocks ' + jobs.map(q => s(q.step)).join(', ') : '; no unsent email job') + '): recorded as the Desk records a conversation email (mail_review, conversation_sent)', Object.assign({ via: 'address', job_key: '' }, p), { basis: cv.level + ' level: ' + cv.why });
      if (jobs.length) { const cv = convOf(); if (cv.ok) return conversation(cv); }
      if (jobs.length) return out('manual_sent', 'review', 'sent by hand to ' + p.contact_key + '; no unsent job has this subject (' + jobs.map(q => s(q.step)).join(', ') + ' are unsent): choose the job it was, or ignore it. Automatic sending to this person is held until then', Object.assign({ via: 'address', job_key: '' }, p));
      if (ctx.threads[s(msg.thread_id)]) return out('outbound_in_thread', 'applied', 'your reply in a tracked thread with ' + p.contact_key + ' (recorded; no outreach touch)', Object.assign({ via: 'thread', job_key: '' }, p));
      { const cv = convOf(); if (cv.ok) return conversation(cv); }
      return out('outbound_other', 'review', 'sent by hand to ' + p.contact_key + ', who has no unsent email job and no tracked thread: record it as a manual send of a job, or ignore it', Object.assign({ via: 'address', job_key: '' }, p));
    }
    const link = linkOf(msg, ctx);
    const bounce = BOUNCE_FROM.test(from) || BOUNCE_SUBJ.test(s(msg.subject));
    if (bounce) {
      let p = link && link.via !== 'address' ? link : null;
      if (!p) { const failed = emailsIn(msg.text).map(e => ctx.contactsByEmail[e]).find(Boolean); if (failed) p = Object.assign({ via: 'body address', job_key: '' }, personFrom(failed)); }
      const dk = deliveryKind(msg);   // 1.8: only a permanent failure is a bounce; a delay or an unclear notice is a review item that blocks nothing
      if (dk.kind === 'temporary') return out('delivery_delay', 'noted', 'a delayed or temporary delivery notice' + (p ? ' for ' + p.contact_key + ' (' + p.via + ')' : ' (recipient not a tracked contact or thread)') + ': ' + dk.why + '; recorded only (status noted): not a bounce, nothing is held, stopped or suppressed; if delivery later fails for good, that failure notice is captured as a bounce', p);   // rc2: OWNER's rule, a delay is recorded and blocks nothing (no reader treats noted as review)
      if (dk.kind !== 'permanent') return out('delivery_unclear', 'review', 'a delivery notice that is not clearly a permanent failure' + (p ? ' for ' + p.contact_key + ' (' + p.via + ')' : ' (recipient not a tracked contact or thread)') + ': ' + dk.why + '; not a bounce, nothing is stopped or suppressed: if it later fails for good, the failure notice is captured as a bounce; or ignore it', p);
      if (p) return out('bounce', 'applied', 'delivery failure for ' + p.contact_key + ' (' + p.via + ')', p);
      return out('bounce', 'review', 'a delivery failure whose recipient is not a tracked contact or thread: choose the person, or ignore it', null);
    }
    if (!link) {
      const d = (from.split('@')[1] || ''); const co = ctx.domains[d];
      if (co) return out('unlinked_inbound', 'review', 'from ' + from + ' at ' + co + ', who is not a tracked contact, outside any tracked thread: a reply on someone\'s behalf, or unrelated; decide', { via: 'firm domain', job_key: '', company_key: co, contact_key: '', apollo_person_id: '', name: '' });
      return out('not_tracked', 'ignored', 'not from a tracked contact and not in a tracked thread');
    }
    const auto = isAuto(msg); const ooo = OOO_SUBJ.test(s(msg.subject)) || (auto && OOO_BODY.test(text));
    if (ooo) {
      // 1.5 (30 Sep, OWNER): an out-of-office is a temporary absence, never a reply, a rejection or an opt-out. The pause ends when the
      // return day starts (the return date itself, at 12:00Z: before any US morning window that day and after every window of the day
      // before), so only touches that fall inside the absence move, to the first eligible window on or after the return, with their
      // spacing kept; a touch already planned on or after the return date keeps its date. No return date, or an ambiguous one (several
      // dates, or a date in the past): nothing is paused automatically, the event goes to review for a decision by hand. Never the
      // alternate address named in the reply, never a backup switch. A later human reply, opt-out or hold overrides the pause.
      const R = oooReturn(s(msg.subject) + '\n' + s(msg.text).slice(0, 4000), when, ctx.contacts[link.contact_key]);   // 1.7
      const rd = R.certainty === 'clear' ? R.date : null; const xo = { excerpt: excerptOf(msg.text), return_note: R.why, return_quote: R.quote };
      // 1.6: without a reliable return date nothing is invented and nothing continues silently: one review item, and a temporary hold
      // on every channel for that person (Suppression scope contact, channel all, status hold_unverified, row_key ooo:<message id>) that
      // the sender gate, the schedule engine, the Desk and the reminder engine all enforce. 1.7: the Desk shows the message and the
      // reading, and its Out of office actions (set the return date, or resume them) resolve it; this capture then clears the hold.
      const HOLD = 'held on every channel (email, LinkedIn, calls and their reminders) until you set the return date or resume them on the Desk (their panel, Out of office); the capture then clears the hold';
      if (link.via === 'address') return out('ooo_auto_reply', 'review', 'out-of-office from ' + link.contact_key + ' outside any tracked thread (' + (rd ? 'return date read from the message: ' + isoDay(rd) : R.why + (R.day ? '; proposed return ' + R.day : '')) + '): confirm the return date or ignore it; ' + HOLD, link, Object.assign({ pause_until: '', return_date: rd ? isoDay(rd) : R.day, hold: true }, xo));
      if (!rd) return out('ooo_auto_reply', 'review', 'out-of-office from ' + link.contact_key + '; ' + (R.certainty === 'missing' ? 'no return date found in the message' : 'the return date is uncertain: ' + R.why) + (R.day ? '; proposed return ' + R.day + ' (not applied)' : '') + ': nothing paused automatically; ' + HOLD, link, Object.assign({ pause_until: '', return_date: R.day, hold: true }, xo));
      const ps = pauseStartOf(rd, ctx.contacts[link.contact_key]);   // 1.6: the return day starts in the recipient's zone
      return out('ooo_auto_reply', 'applied', 'out-of-office from ' + link.contact_key + '; return date read from the message: ' + isoDay(rd) + ' ("' + R.quote + '"); paused until the return day starts for them (' + isoDay(rd) + ' 00:00 ' + ps.tz + ', ' + ps.basis + '); touches on or after it keep their dates (confirm, change or lift it on the Desk)', link, Object.assign({ pause_until: isoDay(rd), pause_at: ps.at, pause_tz: ps.tz, pause_basis: ps.basis, return_date: isoDay(rd) }, xo));
    }
    if (OPTOUT.test(text) && s(msg.text).length < 1500) {
      return out('opt_out', link.via === 'address' ? 'review' : 'applied', 'asks not to be contacted' + (link.via === 'address' ? ' (from a tracked address outside any tracked thread): confirm' : ''), link);
    }
    const phrase = optOutPhrase(msg.text, ctx.contacts[link.contact_key]);   // 1.8: the whole new text is an approved phrase, at any total length
    if (phrase) return out('opt_out', link.via === 'address' ? 'review' : 'applied', 'asks not to be contacted ("' + phrase + '" is the whole new text of the message)' + (link.via === 'address' ? ' (from a tracked address outside any tracked thread): confirm' : ''), link);
    if (auto) return out('unlinked_inbound', 'review', 'an automatic message from ' + link.contact_key + ' (' + link.via + ') that is neither an out-of-office nor a bounce: decide what it is', link);
    if (link.via === 'address') return out('unlinked_inbound', 'review', 'from ' + link.contact_key + ' but not in any tracked thread: a reply to a hand-sent email, or unrelated; decide', link);
    return out('reply', 'applied', 'human reply from ' + link.contact_key + ' in a tracked thread (' + link.via + '); the sequence stops and a Respond task is created', link);
  }

  // capture 1.9 (5 Oct 2026): RECONCILIATION by message id. The capture writes the Mail_Events index row before the effects (Activity,
  // Suppression, Queue); a run that stopped in between left a message indexed as applied with an effect missing, and later runs skipped
  // it as already recorded. reconcileTargets lists the capture's own indexed messages (activity_id = "m" + message id, status applied)
  // whose effect is missing: the Activity row; for an opt-out the Suppression row optout:<id>; for a hand-sent email its Queue job still
  // unsent. The run fetches those messages again, classifies them as new, and writes ONLY the missing effects (each keyed by the message
  // id, so nothing is written twice). A different classification, or a job no longer open, writes nothing and is reported.
  function reconcileTargets(tabs) {
    const S = v => String(v == null ? '' : v).trim();
    const act = new Set((tabs.Activity || []).map(a => S(a.activity_id)).filter(Boolean));
    const sup = new Set((tabs.Suppression || []).map(r => S(r.row_key)).filter(Boolean));
    const q = {}; for (const r of (tabs.Queue || [])) if (S(r.job_key)) q[S(r.job_key)] = r;
    const out = {};
    for (const m of (tabs.Mail_Events || [])) {
      const id = S(m.message_id); if (!id || !/^applied$/i.test(S(m.status)) || S(m.activity_id) !== 'm' + id) continue;
      const miss = [];
      if (!act.has('m' + id)) miss.push('activity');
      if (S(m.classification) === 'opt_out' && !sup.has('optout:' + id)) miss.push('suppression');
      const j = q[S(m.job_key)];
      if (S(m.classification) === 'manual_sent' && j && !/^sent$/i.test(S(j.status)) && !S(j.sent_at) && !/^cancel/i.test(S(j.status))) miss.push('queue');
      if (miss.length) out[id] = { row: m, missing: miss };
    }
    return out;
  }
  // Plan the workbook rows for a batch of messages. cfg: Config as {key: value}; now: Date; runId: string.
  function capture(messages, tabs, cfg, now, runId) {
    const recon = reconcileTargets(tabs);   // 1.9
    const ctx = buildCtx(tabs, cfg); const nowIso = now.toISOString(); const out = { mailEvents: [], activity: [], suppression: [], queue: [], config: [], summary: { applied: 0, review: 0, ignored: 0, noted: 0, by: {} } };
    const ordered = (messages || []).filter(m => s(m.message_id)).sort((a, b) => s(a.date).localeCompare(s(b.date)) || s(a.message_id).localeCompare(s(b.message_id)));
    const dupIn = new Set();
    for (const msg of ordered) {
      const id = s(msg.message_id); if (dupIn.has(id)) continue; dupIn.add(id);
      const R0 = recon[id] || null; const n0 = { a: out.activity.length, s: out.suppression.length, q: out.queue.length, m: out.mailEvents.length };   // 1.9
      let c; if (R0) { ctx.seen.delete(id); const hadP = ctx.providerIds.delete(id); c = classify(msg, ctx, now); ctx.seen.add(id); if (hadP) ctx.providerIds.add(id); } else c = classify(msg, ctx, now);
      const L = c.link || {}; const when = new Date(s(msg.date) || nowIso); const whenIso = isNaN(when) ? nowIso : when.toISOString();
      // no new row for a message already in Mail_Events (a real mailbox lists the same recent messages on every run) nor for mail
      // that touches no tracked contact or thread: both are counted in the summary only, so Mail_Events stays the thread index
      if ((c.classification === 'already_recorded' && ctx.seen.has(id)) || c.classification === 'not_tracked') { out.summary[c.status]++; out.summary.by[c.classification] = (out.summary.by[c.classification] || 0) + 1; continue; }
      const h = msg.headers || {}; const dir = (ctx.sender && emailOf(msg.from) === ctx.sender) ? 'out' : 'in';
      const ev = { message_id: id, thread_id: s(msg.thread_id), rfc_message_id: s(h['message-id'] || h['Message-ID'] || h['Message-Id']), in_reply_to: s(h['in-reply-to'] || h['In-Reply-To']), references_ids: (s(h.references || h.References).match(/<[^>]+>/g) || []).join(' '),   // 1.4: stored as sent (Message-IDs are case-sensitive); matching lower-cases
       
        direction: dir, from: s(msg.from).slice(0, 200), to: s(msg.to).slice(0, 300), date: whenIso, subject: s(msg.subject).slice(0, 200), classification: c.classification, confidence: c.confidence,
        company_key: s(L.company_key), contact_key: s(L.contact_key), apollo_person_id: s(L.apollo_person_id), job_key: s(L.job_key), status: c.status, reason: c.reason, activity_id: '', captured_at: nowIso, resolved_at: '', resolved_by: '', run_id: s(runId), excerpt: c.excerpt || (dir === 'in' && (c.status === 'review' || c.status === 'noted') ? excerptOf(msg.text) : '') };   // 1.7: excerpt for the Desk
      let activity = null;
      if (c.status === 'applied') {
        const base = { activity_id: 'm' + id, ts: whenIso, company_key: ev.company_key, contact_key: ev.contact_key, apollo_person_id: ev.apollo_person_id, channel: 'email', direction: dir, step: '', job_key: '', outcome: '', notes: '', next_action: '', next_action_date: '', logged_by: 'capture', provider_message_id: id, to: '', action: '', next_owner: '', logged_at: nowIso, link_id: ev.thread_id };
        if (c.classification === 'reply') activity = Object.assign(base, { action: 'reply', outcome: 'replied_neutral', notes: 'reply captured from the mailbox (subject "' + s(msg.subject).slice(0, 80) + '"); sentiment not classified: read it and respond', next_action: 'Respond to ' + (L.name || ev.contact_key) + ' (reply received ' + ilDay(when) + ')', next_owner: 'OWNER', next_action_date: ilDay(now) });
        if (c.classification === 'bounce') activity = Object.assign(base, { action: 'bounce', outcome: 'bounce', notes: 'delivery failure captured from the mailbox (' + L.via + '); email to this address stops' });
        if (c.classification === 'opt_out') { activity = Object.assign(base, { action: 'opt_out', outcome: 'opt_out', notes: 'opt-out captured from the mailbox: "' + s(msg.text).replace(/\s+/g, ' ').slice(0, 120) + '"' });
          out.suppression.push({ scope: 'contact', company_key: ev.company_key, contact_key: ev.contact_key, apollo_person_id: ev.apollo_person_id, channel: 'all', status: 'suppressed', reason: 'opt-out by email on ' + whenIso.slice(0, 10) + ' (message ' + id + ')', source: 'OR-05 mailbox capture', recorded_at: nowIso.slice(0, 10), verified_at: '', cleared_at: '', cleared_by: '', row_key: 'optout:' + id }); }
        if (c.classification === 'ooo_auto_reply' && c.pause_until) activity = Object.assign(base, { action: 'schedule_set', outcome: 'pause_set', channel: 'note', direction: '', next_action_date: c.pause_at || (c.pause_until + 'T12:00:00.000Z'), notes: 'out-of-office auto reply captured from the mailbox; return date read from it: ' + c.return_date + (c.return_quote ? ' ("' + c.return_quote + '")' : '') + '; paused until the return day starts for them (' + c.pause_until + ' 00:00 ' + (c.pause_tz || 'UTC') + ', ' + (c.pause_basis || '') + '); touches on or after it keep their dates (change or lift it on the Desk)' });   // 1.6: the return day in the recipient's zone; no row without a return date
        if (c.classification === 'manual_sent') { const q = c.job; activity = Object.assign(base, { action: 'email_sent', outcome: 'sent', step: s(q.step), job_key: s(q.job_key), to: s(q.to), notes: 'sent by hand; reconciled from the mailbox by recipient, subject and the full reviewed text (message ' + id + ')' });
          out.queue.push({ job_key: s(q.job_key), status: 'sent', sent_at: whenIso, provider_message_id: id }); ev.job_key = s(q.job_key); }
        if (c.classification === 'conversation_sent') activity = Object.assign(base, { action: 'mail_review', outcome: 'sent', step: '', job_key: '', link_id: '', to: ((s(ev.to).match(/[^\s<>"',;]+@[^\s<>"',;]+/) || [''])[0]).slice(0, 200),
          notes: ['conversation email outside the sequence' + (s(msg.subject) ? ' "' + s(msg.subject).slice(0, 80) + '"' : '') + ' (mailbox event ' + id + ')', ('recorded by the mailbox capture ' + VERSION + ', ' + s(c.basis)).slice(0, 300)].join('. ') });   // 1.10: the fields OR-04 desk_log 3.11 writes for mail_review / conversation_sent
        if (activity) { ev.activity_id = activity.activity_id; out.activity.push(activity); ctx.activityRows.push(activity); }
      }
      if (c.status === 'review' && c.classification === 'ooo_auto_reply' && c.hold && ev.contact_key) {   // 1.6: the temporary hold, once per person while an earlier one is active
        const held = ctx.suppression.some(r => !s(r.cleared_at) && /^ooo:/.test(s(r.row_key)) && s(r.channel) === 'all' && (s(r.contact_key) === ev.contact_key || (s(r.apollo_person_id) && s(r.apollo_person_id) === ev.apollo_person_id)));
        if (!held) { const row = { scope: 'contact', company_key: ev.company_key, contact_key: ev.contact_key, apollo_person_id: ev.apollo_person_id, channel: 'all', status: 'hold_unverified', reason: 'out-of-office reply on ' + whenIso.slice(0, 10) + ' without a reliable return date (message ' + id + (c.return_note ? '; ' + c.return_note : '') + (c.return_date ? '; proposed return ' + c.return_date : '') + '); temporary hold on every channel until you set the return date or resume them on the Desk (their panel, Out of office); the capture then clears this row', source: 'OR-05 mailbox capture', recorded_at: nowIso.slice(0, 10), verified_at: '', cleared_at: '', cleared_by: '', row_key: 'ooo:' + id }; out.suppression.push(row); ctx.suppression.push(row); }
      }
      if (dir === 'out' && ev.contact_key && ev.thread_id) (ctx.threads[ev.thread_id] = ctx.threads[ev.thread_id] || []).push(ev);   // later messages in this batch may reply to it
      ctx.seen.add(id); if (ev.rfc_message_id) ctx.byRfc[ev.rfc_message_id.toLowerCase()] = ev; if (dir === 'in' && ev.thread_id && c.status !== 'ignored' && c.status !== 'noted') ctx.inboundThreads.add(ev.thread_id);
      out.mailEvents.push(ev); out.summary[c.status]++; out.summary.by[c.classification] = (out.summary.by[c.classification] || 0) + 1;
      if (R0) {   // 1.9: keep only the missing effects of an indexed message; never a second index row
        out.mailEvents.length = n0.m; out.summary[c.status]--; out.summary.by[c.classification]--;
        const same = c.status === 'applied' && c.classification === s(R0.row.classification);
        const keepA = same && R0.missing.includes('activity'), keepS = same && R0.missing.includes('suppression'), keepQ = same && R0.missing.includes('queue');
        const newA = out.activity.splice(n0.a), newS = out.suppression.splice(n0.s), newQ = out.queue.splice(n0.q);
        if (keepA) out.activity.push(...newA.filter(a => s(a.activity_id) === 'm' + id));
        if (keepS) out.suppression.push(...newS.filter(r => s(r.row_key) === 'optout:' + id));
        if (keepQ) out.queue.push(...newQ.filter(r => s(r.job_key) === s(R0.row.job_key)));
        const wrote = [keepA && out.activity.length > n0.a ? 'Activity m' + id : '', keepS && out.suppression.length > n0.s ? 'Suppression optout:' + id : '', keepQ && out.queue.length > n0.q ? 'Queue ' + s(R0.row.job_key) + ' sent' : ''].filter(Boolean);
        (out.reconciled = out.reconciled || []).push({ message_id: id, contact_key: s(R0.row.contact_key), indexed: s(R0.row.classification), now: c.classification + '/' + c.status, missing: R0.missing.join(','), wrote: wrote.join('; '), result: !same ? 'not reconciled: the message now reads as ' + c.classification + ' (' + c.status + '), indexed as ' + s(R0.row.classification) + '; nothing written; tell Claude' : wrote.length ? 'reconciled' : 'nothing to write' });
        out.summary.by.reconciled = (out.summary.by.reconciled || 0) + 1;
      }
    }
    // 1.7: an OOO hold (row_key ooo:<message id>) is cleared by the capture, with the entry that resolved it, once one of these is on
    // record after the hold was captured: a Desk schedule decision for that person (pause_set with a return, resumed, or start_set),
    // a later dated pause from another auto reply, or the event resolved on the Desk as something other than an out-of-office.
    out.suppressionClear = [];
    const evRow = {}; for (const m of (tabs.Mail_Events || [])) evRow[s(m.message_id)] = m; for (const m of out.mailEvents) evRow[s(m.message_id)] = m;
    for (const r of ctx.suppression) {
      if (s(r.cleared_at) || !/^ooo:/.test(s(r.row_key)) || out.mailEvents.some(m => 'ooo:' + s(m.message_id) === s(r.row_key))) continue;
      const mid = s(r.row_key).slice(4); const ev0 = evRow[mid] || {}; const heldAt = Date.parse(s(ev0.captured_at)) || Date.parse(s(r.recorded_at)) || 0; const ck = s(r.contact_key);
      const t = (a) => Date.parse(s(a.logged_at)) || Date.parse(s(a.ts)) || 0;
      const desk = ctx.activityRows.filter(a => s(a.contact_key) === ck && s(a.action) === 'schedule_set' && /^(pause_set|resumed|start_set)$/i.test(s(a.outcome)) && t(a) > heldAt && (!/^capture$/i.test(s(a.logged_by)) || s(a.provider_message_id) !== mid)).sort((a, b) => t(a) - t(b));
      const resolvedOther = /^(resolved|ignored)$/i.test(s(ev0.status)) && !/^ooo_auto_reply$/i.test(s(ev0.classification)) && s(ev0.resolved_by);
      let by = '';
      if (desk.length) { const a = desk[0]; by = (/^capture$/i.test(s(a.logged_by)) ? 'superseded by the dated pause from message ' + s(a.provider_message_id) : 'resolved on the Desk by entry ' + s(a.activity_id)) + ' (' + s(a.outcome) + (s(a.next_action_date) ? ' ' + s(a.next_action_date) : '') + ')'; }
      else if (resolvedOther) by = 'the event was resolved on the Desk as ' + s(ev0.classification) + ' (' + s(ev0.resolved_by) + ')';
      if (by) out.suppressionClear.push({ row_key: s(r.row_key), cleared_at: nowIso, cleared_by: ('OR-05 capture ' + VERSION + ' run ' + s(runId) + ': out-of-office hold ' + by).slice(0, 480) });
    }
    out.regate = out.activity.some(a => /^(sent|replied|bounce|opt_out|pause_set)/.test(a.outcome)) || out.queue.length > 0 || out.suppressionClear.length > 0;
    out.config = [];   // 1.3: the health rows (mail_capture_last_ok and the rest) are decided by the run as a whole (mailbox.js healthRows), never by the classification
    return out;
  }
  const MAIL_EVENT_COLUMNS = ['message_id', 'thread_id', 'rfc_message_id', 'in_reply_to', 'references_ids', 'direction', 'from', 'to', 'date', 'subject', 'classification', 'confidence', 'company_key', 'contact_key', 'apollo_person_id', 'job_key', 'status', 'reason', 'activity_id', 'captured_at', 'resolved_at', 'resolved_by', 'run_id', 'excerpt'];
  const api = { VERSION, reconcileTargets, dsnOwnText, capture, classify, buildCtx, returnDateFrom, returnDatesIn, oooReturn, excerptOf, normSubject, emailOf, contentEvidence, MAIL_EVENT_COLUMNS, newText, optOutPhrase, deliveryKind, OPTOUT_PHRASES, conversationOf };   // 1.8: the last four exported for the offline tests; 1.10: conversationOf
  root.BlocksCapture = api;
})(globalThis);

// BLOCKS mailbox module, version 1.0 (28 Sep 2026). Pure functions shared by BLOCKS-OR-05 (capture) and BLOCKS-OR-03 v4 (sender)
// and the offline tests. Nothing here reads or writes anything; the workflows call the Gmail API (GET only in OR-05; GET plus
// messages.send in OR-03) and pass the JSON responses in.
//
//   gmailToMessage(msg)        a Gmail API message (format full or metadata) -> the message shape capture.js reads
//   syncPlan(cfg, profile)     how this capture run reads the mailbox: history since the checkpoint, or an initial listing
//   collectIds(...)            the ordered, de-duplicated message ids of this run, whether the read is complete, the next checkpoint
//   needsBody(meta, ctx)       whether a message concerns a tracked contact, firm or thread (only those bodies are fetched)
//   healthRows(...)            the Config rows a run writes: ONLY a complete real read of the verified mailbox stamps mail_capture_last_ok
//   presendMailCheck(...)      the holds for a batch from mailbox messages that arrived after the capture checkpoint
//   threadFor(job, tabs)       the Gmail thread, In-Reply-To, References and root subject a follow-up must carry
//   buildMime(item, cfg)       the RFC 2822 message (base64url) for messages.send
//   lockFence(rows, runId, ...) whether this run still holds the shared lock early enough to send
(function (root) {
  'use strict';
  const VERSION = '1.0';
  const s = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  const lc = (v) => s(v).toLowerCase();
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const emailsIn = (v) => Array.from(new Set((s(v).match(EMAIL_RE) || []).map(x => x.toLowerCase())));
  const emailOf = (v) => emailsIn(v)[0] || '';
  const domainOf = (e) => { const m = lc(e).match(/@([a-z0-9.-]+)$/); return m ? m[1] : ''; };
  const rfcIds = (v) => (s(v).match(/<[^>]+>/g) || []).map(x => x.toLowerCase());
  const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com']);
  const DAEMON = /mailer-daemon|postmaster|mail delivery (subsystem|system)|delivery.?notification/i;
  const normSubject = (v) => lc(v).replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, '').replace(/^\[test\]\s*/i, '').replace(/\s+/g, ' ').trim();

  // ---------- Gmail API message -> capture message ----------
  function b64urlDecode(data) {
    const t = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
    if (typeof Buffer !== 'undefined') return Buffer.from(t, 'base64').toString('utf8');
    const bin = atob(t); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder('utf-8').decode(bytes);
  }
  function b64urlEncode(str) {
    const b = typeof Buffer !== 'undefined' ? Buffer.from(str, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(str)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64(str) { return typeof Buffer !== 'undefined' ? Buffer.from(str, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(str))); }
  function partsText(p, want) {
    if (!p) return '';
    if (lc(p.mimeType) === want && p.body && p.body.data) return b64urlDecode(p.body.data);
    for (const q of p.parts || []) { const t = partsText(q, want); if (t) return t; }
    return '';
  }
  function gmailToMessage(msg) {
    const p = msg.payload || {}; const H = {};
    for (const h of p.headers || []) { const k = lc(h.name); if (!(k in H)) H[k] = s(h.value); }
    let text = partsText(p, 'text/plain');
    if (!text) { const html = partsText(p, 'text/html'); text = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' '); }
    const at = msg.internalDate ? new Date(Number(msg.internalDate)) : (H.date ? new Date(H.date) : null);
    return { message_id: s(msg.id), thread_id: s(msg.threadId), headers: { 'message-id': H['message-id'] || '', 'in-reply-to': H['in-reply-to'] || '', references: H.references || '', 'auto-submitted': H['auto-submitted'] || '', precedence: H.precedence || '', 'x-autoreply': H['x-autoreply'] || '', 'x-auto-response-suppress': H['x-auto-response-suppress'] || '' },
      from: H.from || '', to: [H.to, H.cc].filter(Boolean).join(', '), date: at && !isNaN(at) ? at.toISOString() : '', subject: H.subject || '', text: s(text).slice(0, 6000), labels: msg.labelIds || [], snippet_only: !p.parts && !(p.body && p.body.data) };
  }

  // ---------- how this capture run reads the mailbox ----------
  // cfg: Config as {key: value}. The checkpoint is a Gmail historyId (Config mail_capture_checkpoint) set only by a complete or
  // partially complete real read. Without one, the first run lists messages newer than mail_capture_initial_days (default 3).
  function syncPlan(cfg, profile, now) {
    const email = lc(profile && profile.emailAddress);
    if (!email) return { mode: 'error', error: 'mailbox not read: the Gmail profile call returned no mailbox (a disabled or failed node never counts as a read)' };
    if (email !== lc(cfg.sender_address)) return { mode: 'error', error: 'mailbox mismatch: the credential reads ' + email + ', Config sender_address is ' + lc(cfg.sender_address) };
    const cp = s(cfg.mail_capture_checkpoint);
    if (/^\d+$/.test(cp)) return { mode: 'history', startHistoryId: cp, profileHistoryId: s(profile.historyId), email };
    const days = Math.max(1, Math.min(60, parseInt(cfg.mail_capture_initial_days || '3', 10) || 3));
    const after = Math.floor((now.getTime() - days * 864e5) / 1000);
    return { mode: 'list', q: 'after:' + after, reason: 'first read: messages of the last ' + days + ' days', profileHistoryId: s(profile.historyId), email };
  }
  // A history call answered 404 (the checkpoint is older than Gmail keeps history): list from the last complete read instead,
  // with a 60-minute overlap, and say so. The run is complete only if that listing is complete and within the per-run limit.
  function fallbackPlan(cfg, profile, now) {
    const lastOk = Date.parse(s(cfg.mail_capture_last_ok));
    const from = isFinite(lastOk) ? lastOk - 60 * 60000 : now.getTime() - 3 * 864e5;
    return { mode: 'list', q: 'after:' + Math.floor(from / 1000), reason: 'history checkpoint expired: listing everything since the last complete read (' + (isFinite(lastOk) ? new Date(lastOk).toISOString() : 'unknown, 3 days') + ') with a 60 minute overlap', profileHistoryId: s(profile.historyId), email: lc(profile.emailAddress), fallback: true };
  }
  // pages: the HTTP node's items for the history or list call (one per page). known: Set of message ids already in Mail_Events or on
  // Queue/Activity rows. max: the most messages whose details this run fetches.
  function collectIds(plan, pages, known, max) {
    max = Math.max(1, Number(max) || 300);
    const err = pages.find(p => p && (p.error || (p.__status && p.__status >= 400)));
    if (err) { const st = err.__status || (err.error && err.error.status) || ''; return { ok: false, expired: String(st) === '404' || /404|not ?found/i.test(JSON.stringify(err.error || '')), error: 'Gmail ' + (plan.mode === 'history' ? 'history' : 'list') + ' call failed: ' + s(JSON.stringify(err.error || err).slice(0, 200)) }; }
    const last = pages[pages.length - 1] || {};
    const moreRemain = !!last.nextPageToken;
    const ids = []; const seen = new Set(); let skippedKnown = 0, drafts = 0;
    if (plan.mode === 'history') {
      let checkpoint = plan.startHistoryId; let capped = false;
      outer: for (const pg of pages) for (const rec of pg.history || []) {
        const add = (rec.messagesAdded || []).map(x => x.message).filter(Boolean);
        const fresh = [];
        for (const m of add) { const id = s(m.id); if (!id || seen.has(id)) continue; if ((m.labelIds || []).includes('DRAFT')) { drafts++; seen.add(id); continue; } seen.add(id); if (known.has(id)) { skippedKnown++; continue; } fresh.push({ id, threadId: s(m.threadId) }); }
        if (ids.length + fresh.length > max) { capped = true; break outer; }
        ids.push(...fresh); checkpoint = s(rec.id) || checkpoint;
      }
      const complete = !capped && !moreRemain;
      return { ok: true, ids, complete, checkpoint: complete ? s(last.historyId) || checkpoint : checkpoint, skippedKnown, drafts, pages: pages.length,
        behind: complete ? '' : (capped ? 'more than ' + max + ' new messages since the checkpoint: this run processed them in order up to history ' + checkpoint + '; the next run continues' : 'the history listing hit the page limit: processed up to history ' + checkpoint + '; the next run continues') };
    }
    for (const pg of pages) for (const m of pg.messages || []) { const id = s(m.id); if (!id || seen.has(id)) continue; seen.add(id); if (known.has(id)) { skippedKnown++; continue; } ids.push({ id, threadId: s(m.threadId) }); }
    if (moreRemain) return { ok: true, ids: [], complete: false, checkpoint: '', skippedKnown, pages: pages.length, gap: true, behind: 'the listing (' + plan.q + ') has more pages than the per-run page limit: nothing was processed; raise mail_capture_max_pages for one run or reconcile by hand' };
    if (ids.length > max) return { ok: true, ids: [], complete: false, checkpoint: '', skippedKnown, pages: pages.length, gap: true, behind: ids.length + ' unknown messages in the listing (' + plan.q + ') exceed mail_capture_max_messages (' + max + '): nothing was processed; raise the limit for one run so the gap is read completely' };
    return { ok: true, ids, complete: true, checkpoint: s(plan.profileHistoryId), skippedKnown, pages: pages.length, behind: '' };
  }

  // ---------- relevance: only messages about tracked people, firms or threads get their body read ----------
  // ctx: { sender, addresses: Set, domains: Set (firms with Queue jobs, no freemail), threads: Set, rfc: Set }
  function contextFrom(tabs, cfg) {
    const rows = (t) => (tabs[t] || []).filter(r => r && !/^template$/i.test(s(r.message_id || r.job_key || r.activity_id)));
    const ctx = { sender: lc(cfg.sender_address), addresses: new Set(), domains: new Set(), threads: new Set(), rfc: new Set(), known: new Set(), byAddress: {}, byThread: {} };
    const qCos = new Set(rows('Queue').map(q => s(q.company_key)).filter(Boolean));
    for (const c of rows('Contacts')) { const e = emailOf(c.email); if (!e) continue; if (qCos.has(s(c.domain))) { ctx.addresses.add(e); ctx.byAddress[e] = c; const d = domainOf(e); if (d && !FREEMAIL.has(d)) ctx.domains.add(d); } }
    for (const q of rows('Queue')) { const e = emailOf(q.to); if (e) { ctx.addresses.add(e); const d = domainOf(e); if (d && !FREEMAIL.has(d)) ctx.domains.add(d); } if (s(q.provider_message_id)) ctx.known.add(s(q.provider_message_id)); }
    for (const a of rows('Activity')) if (s(a.provider_message_id)) ctx.known.add(s(a.provider_message_id));
    for (const m of rows('Mail_Events')) { ctx.known.add(s(m.message_id)); if (s(m.thread_id) && s(m.contact_key)) { ctx.threads.add(s(m.thread_id)); ctx.byThread[s(m.thread_id)] = s(m.contact_key); } for (const r of rfcIds(m.rfc_message_id)) ctx.rfc.add(r); }
    return ctx;
  }
  function needsBody(meta, ctx) {
    const m = meta.message_id ? meta : gmailToMessage(meta);
    const addrs = emailsIn(m.from + ' ' + m.to);
    if (ctx.threads.has(m.thread_id)) return 'tracked thread';
    if (rfcIds((m.headers || {})['in-reply-to'] + ' ' + (m.headers || {}).references).some(r => ctx.rfc.has(r))) return 'references a tracked message';
    if (addrs.some(a => ctx.addresses.has(a))) return 'tracked address';
    if (addrs.some(a => a !== ctx.sender && ctx.domains.has(domainOf(a)))) return 'tracked firm';
    if (DAEMON.test(m.from)) return 'delivery report';
    return '';
  }

  // ---------- health: only a complete real read of the verified mailbox counts ----------
  // run: { source: 'gmail'|'fixture', startedAt ISO, plan, collect (from collectIds), error, runId }
  function healthRows(run) {
    const R = (key, value) => ({ key, value: String(value == null ? '' : value) });
    if (run.source !== 'gmail') return [R('mail_capture_fixture_last_ok', run.error ? '' : run.startedAt), R('mail_capture_fixture_last_error', run.error || ''), R('mail_capture_fixture_run_id', run.runId)];   // fixtures never touch the real health keys
    if (run.error) return [R('mail_capture_last_error', run.error.slice(0, 300)), R('mail_capture_last_run_id', run.runId)];
    const c = run.collect || {};
    const out = [R('mail_capture_last_run_id', run.runId), R('mail_capture_last_error', ''), R('mail_capture_verified_mailbox', run.plan.email), R('mail_capture_behind', c.complete ? '' : (c.behind || 'incomplete read'))];
    if (c.checkpoint) out.push(R('mail_capture_checkpoint', c.checkpoint));
    if (c.complete) out.push(R('mail_capture_last_ok', run.startedAt));   // the mailbox is known up to the moment this run started reading
    return out;
  }
  // The sender's view of capture health. mode fixture (TEST workbook) may rely on fixture captures; test and live need the real one.
  function captureHealth(cfg, now, mode) {
    const max = Number(cfg.mail_capture_max_age_minutes || 30);
    if (mode === 'fixture') {
      const ok = s(cfg.mail_capture_fixture_last_ok), err = s(cfg.mail_capture_fixture_last_error);
      if (err) return { ok: false, why: 'the last fixture capture failed: ' + err.slice(0, 200) };
      if (!ok) return { ok: false, why: 'no fixture capture has completed' };
      const age = (now.getTime() - Date.parse(ok)) / 60000; if (!(age <= max)) return { ok: false, why: 'the fixture capture is stale: ' + Math.round(age) + ' minutes (limit ' + max + ')' };
      return { ok: true, why: 'fixture capture completed ' + Math.round(age) + ' minutes ago (TEST workbook)', age_minutes: Math.round(age) };
    }
    const ok = s(cfg.mail_capture_last_ok), err = s(cfg.mail_capture_last_error), who = lc(cfg.mail_capture_verified_mailbox), behind = s(cfg.mail_capture_behind);
    if (err) return { ok: false, why: 'the last mailbox capture failed: ' + err.slice(0, 200) };
    if (!ok || !who) return { ok: false, why: 'no complete read of the real mailbox is recorded (fixture, disabled or setup runs never count)' };
    if (who !== lc(cfg.sender_address)) return { ok: false, why: 'the last complete read was of ' + who + ', not the sender ' + lc(cfg.sender_address) };
    if (behind) return { ok: false, why: 'the capture is catching up: ' + behind.slice(0, 200) };
    const age = (now.getTime() - Date.parse(ok)) / 60000;
    if (!isFinite(age)) return { ok: false, why: 'Config mail_capture_last_ok is not a time: ' + ok };
    if (age > max) return { ok: false, why: 'the mailbox capture is stale: last complete read ' + Math.round(age) + ' minutes ago (limit ' + max + ')' };
    return { ok: true, why: 'complete read of ' + who + ' ' + Math.round(age) + ' minutes ago', age_minutes: Math.round(age) };
  }

  // ---------- the check immediately before sending ----------
  // msgs: capture-shape messages (metadata is enough) that arrived after the capture checkpoint and are not in Mail_Events.
  // batch: the jobs about to be sent (with to, contact_key, apollo_person_id, thread info). Any message involving the person
  // (from or to their address, from their firm's domain, in their thread, referencing their messages) holds that job: the capture
  // classifies it first (a reply stops the sequence, a hand send is reconciled). A delivery report holds the whole batch.
  function presendMailCheck(msgs, batch, ctx, readError) {
    const held = {}; const hold = (j, why) => { if (!held[j.job_key]) held[j.job_key] = why; };
    if (readError) { for (const j of batch) hold(j, 'the mailbox check before sending failed: ' + String(readError).slice(0, 160)); return { held, checked: 0 }; }
    for (const m of msgs) {
      const addrs = emailsIn(m.from + ' ' + m.to); const refs = rfcIds((m.headers || {})['in-reply-to'] + ' ' + (m.headers || {}).references);
      if (DAEMON.test(m.from)) { for (const j of batch) hold(j, 'a delivery report arrived after the last capture; the capture reads it first'); continue; }
      for (const j of batch) {
        const a = emailOf(j.to); const d = domainOf(a); const th = j.thread || {};
        const involved = addrs.includes(a) || (d && !FREEMAIL.has(d) && addrs.some(x => x !== ctx.sender && domainOf(x) === d)) || (th.threadId && m.thread_id === th.threadId) || refs.some(r => (th.rfcIds || []).includes(r));
        if (involved) hold(j, (emailOf(m.from) === ctx.sender ? 'an email to this person was sent from the mailbox after the last capture (a possible hand send)' : 'a message from this person or firm arrived after the last capture') + '; the capture classifies it first');
      }
    }
    return { held, checked: msgs.length };
  }

  // ---------- threading ----------
  // The follow-up goes into the thread of the sequence's first email: threadId, In-Reply-To = the last message we sent in it,
  // References = every message of ours in it, oldest first; Subject = "Re: " + the first email's subject (Gmail threads a message
  // only when the subject matches). tabs.Mail_Events rows with direction out for this person, status applied.
  function threadFor(job, tabs) {
    if (s(job.step) === 'E1') return { first: true };
    const pk = s(job.apollo_person_id), ck = s(job.contact_key);
    const outs = (tabs.Mail_Events || []).filter(m => lc(m.direction) === 'out' && /^applied$/i.test(s(m.status)) && ((pk && s(m.apollo_person_id) === pk) || (ck && s(m.contact_key) === ck)) && s(m.thread_id))
      .sort((a, b) => s(a.date).localeCompare(s(b.date)));
    if (!outs.length) return { error: 'the thread of the first email to this person is not recorded (no sent email in Mail_Events): the follow-up cannot be sent as a reply' };
    const root = outs[0]; const inThread = outs.filter(m => s(m.thread_id) === s(root.thread_id));
    const ids = inThread.map(m => rfcIds(m.rfc_message_id)[0] || '').filter(Boolean);
    if (ids.length !== inThread.length) return { error: 'the Message-ID of an earlier email in this thread is not recorded: the follow-up cannot carry correct In-Reply-To and References' };
    const rootSubject = s(root.subject).replace(/^\[test\]\s*/i, '');
    return { threadId: s(root.thread_id), inReplyTo: ids[ids.length - 1], references: ids, rfcIds: ids, rootSubject, replySubject: 'Re: ' + normSubjectKeepCase(rootSubject) };
  }
  function normSubjectKeepCase(v) { return s(v).replace(/^(\s*(re|fwd?|aw|sv)\s*:\s*)+/i, '').trim(); }
  function subjectMatchesThread(jobSubject, thread) { return normSubject(jobSubject) === normSubject(thread.rootSubject) && /^\s*re\s*:/i.test(s(jobSubject)); }

  // ---------- the message ----------
  function encodeHeader(v) { return /^[\x20-\x7e]*$/.test(v) ? v : '=?UTF-8?B?' + b64(v) + '?='; }
  function wrap76(t) { return t.replace(/(.{76})/g, '$1\r\n'); }
  // item: { send_to, send_subject, message_text, job_key, thread: {threadId, inReplyTo, references} | {first:true} }
  function buildMime(item, cfg, stamp) {
    const allow = s(cfg.send_recipient_allowlist).split(/[\s,;]+/).map(lc).filter(Boolean);
    const to = lc(item.send_to);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('recipient address invalid for job ' + item.job_key);
    if (allow.length && !allow.includes(to)) throw new Error('recipient ' + to + ' is not in Config send_recipient_allowlist; nothing was sent');
    const from = lc(cfg.sender_address); const name = s(cfg.sender_name) || 'OWNER_NAME';
    const msgId = '<blocks.' + s(item.job_key) + '.' + s(stamp) + '@' + (domainOf(from) || 'example.com') + '>';
    const th = item.thread || {};
    const H = ['From: ' + encodeHeader(name) + ' <' + from + '>', 'To: ' + to, 'Subject: ' + encodeHeader(s(item.send_subject)), 'Message-ID: ' + msgId, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'];
    if (th.inReplyTo) { H.push('In-Reply-To: ' + th.inReplyTo); H.push('References: ' + (th.references || [th.inReplyTo]).join(' ')); }
    const body = String(item.message_text || '').replace(/\r?\n/g, '\r\n');
    const raw = H.join('\r\n') + '\r\n\r\n' + wrap76(b64(body)) + '\r\n';
    const req = { raw: b64urlEncode(raw) }; if (th.threadId) req.threadId = th.threadId;
    return { request: req, message_id_header: msgId, headers: H };
  }

  // ---------- the shared lock, checked again right before sending ----------
  // rows: the Desk_Import_Lock rows read after the attempts were recorded. The run may send only if the lock row is still its own
  // and young enough that no other run can declare it stale before the sends finish: age < lock_stale_minutes - send_budget_minutes.
  // sends: how many emails this run is about to send; each costs at most one minute (a 30 s send timeout plus a 30 s header read),
  // so the budget is the larger of send_budget_minutes and one minute per send.
  function lockFence(rows, runId, sheetId, now, cfg, sends) {
    const stale = Number(cfg.lock_stale_minutes || 10), budget = Math.max(Number(cfg.send_budget_minutes || 4), Number(sends || 0));
    const row = (rows || []).find(r => r && s(r.run_id));
    if (!row) return { ok: false, why: 'the lock tab has no holder row: this run no longer holds the lock; nothing is sent (the attempts stay open for review)' };
    if (s(row.run_id) !== s(runId) || (sheetId && s(row.sheet_id) && s(row.sheet_id) !== s(sheetId))) return { ok: false, why: 'the lock is now held by run ' + s(row.run_id) + ' (' + s(row.workflow) + '): this run lost it and sends nothing (the attempts stay open for review)' };
    const age = (now.getTime() - Date.parse(s(row.acquired_at))) / 60000;
    if (!isFinite(age)) return { ok: false, why: 'the lock row has no valid acquired_at; nothing is sent' };
    if (age >= stale - budget) return { ok: false, why: 'this run has held the lock ' + Math.round(age) + ' minutes; another run may declare it stale at ' + stale + ' minutes, so it sends nothing (the attempts stay open for review)' };
    return { ok: true, why: 'lock held by this run for ' + Math.round(age * 10) / 10 + ' minutes (limit to start ' + (sends || 0) + ' send(s): ' + (stale - budget) + ')', age_minutes: Math.round(age * 10) / 10, budget_minutes: budget };
  }

  const api = { VERSION, gmailToMessage, syncPlan, fallbackPlan, collectIds, contextFrom, needsBody, healthRows, captureHealth, presendMailCheck, threadFor, subjectMatchesThread, buildMime, lockFence, b64urlDecode, b64urlEncode, normSubject, emailOf, emailsIn, domainOf, rfcIds, FREEMAIL };
  root.BlocksMailbox = api;
})(globalThis);

// ---- shared by the OR-05 v2 code nodes ----
const M = globalThis.BlocksMailbox;
const cfgMap = () => { const c = {}; for (const r of $('Read Config').all().map(i => i.json)) if (r && r.key) c[String(r.key).trim()] = String(r.value == null ? '' : r.value).trim(); return c; };
const tabRows = (n) => { try { return $(n).all().map(i => i.json).filter(r => r && Object.keys(r).length > 1); } catch (e) { return []; } };
const tabsNow = () => ({ Contacts: tabRows('Read Contacts'), Queue: tabRows('Read Queue'), Activity: tabRows('Read Activity'), Suppression: tabRows('Read Suppression'), Mail_Events: tabRows('Read Mail_Events'), Research: tabRows('Read Research') });   // 1.10: Research for conversationOf
const ran = (n) => { try { return $(n).isExecuted; } catch (e) { return false; } };
const bodyOf = (j) => (j && j.body && typeof j.body === 'object') ? Object.assign({ __status: j.statusCode }, j.body) : Object.assign({ __status: j && j.statusCode }, j || {});

// ---- BLOCKS-OR-05 v2 glue: classify, plan the rows, and the health rows for the run as a whole ----
const cfg = cfgMap(); const tabs = tabsNow(); const src = $('Config').first().json.source;
const items = $('Normalize Messages').all().map(i => i.json);
const out = []; const add = (op, list) => { for (const r of list) out.push({ json: { __op: op, row: r } }); };
const runId = String($execution.id); const fileIds = Array.from(new Set(items.map(m => m.__file_id).filter(Boolean)));
const meta = src === 'gmail' && ran('Collect Ids') ? (($('Collect Ids').first().json || {}).__meta || {}) : {};
const startedAt = (meta.plan && meta.plan.startedAt) || new Date().toISOString();
const srcErr = items.find(m => m.__source_error);
if (srcErr) {   // the mailbox could not be read completely: stamp the error, write nothing else, move no checkpoint; the sender holds
  add('config', M.healthRows({ source: src, startedAt, error: String(srcErr.__source_error).slice(0, 300), runId }));
  for (const id of fileIds) out.push({ json: { __op: 'move', row: { file_id: id } } });
  out.push({ json: { __op: 'summary', row: { regate: false, error: String(srcErr.__source_error).slice(0, 300), source: src, read: meta.plan || null, counts: { messages: 0 } } } });
  return out;
}
const messages = items.filter(m => m.message_id);
const plan = globalThis.BlocksCapture.capture(messages, tabs, cfg, new Date(), runId);
add('mail_event', plan.mailEvents); add('activity', plan.activity); add('suppression', plan.suppression); add('suppression_clear', plan.suppressionClear || []); add('queue', plan.queue);
add('config', M.healthRows({ source: src, startedAt, plan: meta.plan || {}, collect: meta.result || {}, runId }));
const sel0 = src === 'gmail' && ran('Select Bodies') ? (($('Select Bodies').first().json || {}).__stats || {}) : {};
if (src === 'gmail') add('config', [{ key: 'mail_capture_last_report', value: JSON.stringify({ run: runId, started_at: startedAt, mode: meta.plan.mode, fallback: !!meta.plan.fallback, complete: !!meta.result.complete, pages: meta.result.pages, new_ids: meta.result.count, already_known: meta.result.skippedKnown, unrelated_counted_only: sel0.skipped_unrelated || 0, bodies_read: messages.length, applied: plan.summary.applied, review: plan.summary.review, ignored: plan.summary.ignored, by: plan.summary.by }) }]);   // counts only: never a subject, sender or body
for (const id of fileIds) out.push({ json: { __op: 'move', row: { file_id: id } } });
const sel = src === 'gmail' && ran('Select Bodies') ? (($('Select Bodies').first().json || {}).__stats || {}) : {};
out.push({ json: { __op: 'summary', row: { regate: plan.regate, source: src, read: src === 'gmail' ? { mode: meta.plan.mode, fallback: meta.plan.fallback, reason: meta.plan.reason, mailbox: meta.plan.email, started_at: startedAt, complete: meta.result.complete, behind: meta.result.behind || '', checkpoint: meta.result.checkpoint || '', new_ids: meta.result.count, already_known: meta.result.skippedKnown, pages: meta.result.pages, unrelated_counted_only: sel.skipped_unrelated || 0, gone: sel.gone || 0, bodies_read: messages.length } : null,
  counts: { messages: messages.length, mail_events: plan.mailEvents.length, activity: plan.activity.length, suppression: plan.suppression.length, queue: plan.queue.length, files: fileIds.length }, statuses: plan.summary, reconciled: plan.reconciled || [] } } });   // 1.9
return out;