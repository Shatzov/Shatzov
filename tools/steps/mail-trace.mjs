// Where does each open mailbox event (Mail_Events status review) appear on Today? Prints one JSON report.
export default async function (page, ctx) {
  const r = await page.evaluate(() => { const st = window.__deskState; const N = st.nx || {}; const ME = (st.tabs.Mail_Events || []).filter(m => /^review$/i.test(String(m.status || '')));
    const flat = (L) => { const o = []; for (const x of L || []) { if (x.kind === 'mailgroup') for (const y of x.members) o.push(Object.assign({ grp: x.id }, y)); else o.push(x); } return o; };
    const where = {}; const add = (lst, name) => { for (const x of flat(lst)) { const mid = String(x.message_id || (/^review:/.test(String(x.id || '')) ? String(x.id).split(':').pop() : '')); if (mid) (where[mid] = where[mid] || []).push(name + (x.grp ? ' (in group)' : '') + ' kind=' + x.kind); } };
    for (const g of Object.keys(N.P || {})) add(N.P[g], 'P.' + g);
    const rows = ME.map(m => ({ id: m.message_id, dir: m.direction, cls: m.classification, firm: m.company_key || '(none)', ck: m.contact_key ? 'yes' : 'no', shown: where[m.message_id] || [] }));
    const doNowRows = (N.P && N.P.now || []).length, groups = (N.P && N.P.now || []).filter(x => x.kind === 'mailgroup');
    const domRows = document.querySelectorAll('[data-testid="wl-group-now"] ul[data-group="now"] > li').length;
    const domMsgs = document.querySelectorAll('[data-testid="wl-group-now"] li.r12mg details li.trw').length;
    return { open_review_rows: ME.length, rows, doNow_items: doNowRows, mail_groups: groups.map(g => ({ firm: g.key, members: g.members.length })), dom_top_rows: domRows, dom_msgs_in_groups: domMsgs };
  });
  console.log(JSON.stringify(r));
}
