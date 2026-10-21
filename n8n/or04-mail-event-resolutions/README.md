# OR-04 "Mail Event Resolutions" 1.0 and Desk r13: mailbox events matched to no firm

Installed 21 Oct 2026: OR-04 version `ee3541ca` (previous `ba159795`), Desk version `1792604440-4c68` (previous `1792536216-4c87`).

**Problem.** The capture (OR-05) files a mailbox event it cannot match to any tracked person (a bounce for an untracked address, an
email from a stranger) with an empty `company_key` and status `review`. The Desk listed it, but the only resolution action,
`mail_review`, needs a firm on both sides (Desk form and OR-04 Plan), so the event could not be closed from the Desk.

**Fix.**
- Desk r13: the event's row in Do now has two controls. **Associate** (choose the firm, optionally a person of that firm, say how
  you confirmed it, tick the confirmation) and **Mark it irrelevant** (say why). Nothing is proposed: the firm list starts empty.
  Settings → Mailbox lists events resolved this way, each with **Reopen for review**.
- New Desk action `mail_event_resolve` (`resolution`: `associate` | `ignore` | `reopen`). The OR-04 Plan (desk_log 3.6.2, 348 KB, not
  changed) rejects it as an unknown action; the new Code node `Mail Event Resolutions`, between Plan and the Pick nodes, decides it
  and replaces that rejection row. `Pick Mail Events`, `Pick Import Rows` and `Import Summary` read the new node.

**What an accepted entry writes:** the one Mail_Events row (`status`, and for associate `company_key`, `contact_key`,
`apollo_person_id`; `resolved_at`, `resolved_by`; the classification is kept) with an audit note appended to `reason`
(`[desk associated|ignored|reopened <time> by Itamar (Desk <event id>) ...: <your note>]`), and its Desk_Import row. Never an
Activity, Queue, Suppression, Contacts, Research or Config row, and never a gate run. The sender and gate do not read resolved
events. Derived effect, by design: the stage module reads Mail_Events by firm, so an associated event can serve as evidence for
that firm's tasks (e.g. a calendar acceptance verifying a booked meeting, or our reply closing a "respond" task).

**Guards.** Only events with no firm and status `review` can be associated or ignored; the firm must be in Companies and the
person in Contacts at that firm; a note is required (and the confirmation for associate). Reopen undoes only the last associate or
ignore made this way (never a resolution that wrote an Activity row), clears the firm and person it set, and keeps every earlier
note. Repeated saves of one entry (same event id) are recorded once; a run that stopped after the Mail_Events write is completed
without writing again; an entry for an event the Plan changes in the same run is refused. If the node itself fails, the Plan's
output passes on unchanged (the entries stay rejected, nothing is written).

**Tests.** `tools/test.sh` step 4c (Desk, sanitized fixture: form validation, person list scoped to the firm, one entry per save,
failed save, lost answer, reload, refused entry shown, reopen from Settings) and step 4d (the node run after the live Plan code on
a private workbook copy: 9 groups, private).

**Rollback.** OR-04: restore `ba159795-776f-4bf7-a751-6a1bedcd9251` and publish (if OR-04 changed since, remove only the node and
point the three Pick/Summary nodes back to `Plan`). Desk: republish version `1792536216-4c87` (private backups). Rows already
resolved stay as written; reopen them from the Desk first if needed.
