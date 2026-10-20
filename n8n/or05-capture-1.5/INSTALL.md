# OR-05 capture 1.10: conversation emails recorded automatically

Workflow: **BLOCKS-OR-05 v2 | Capture Mailbox** (n8n id `0dbM37DbT0GTUgDT`). One node changes: the Code node **Capture**.
Every other node, every connection, the settings and the credentials stay as they are.

The folder is named `or05-capture-1.5` after the version in the workflow's label and description ("capture 1.4"). Those strings
are out of date: the capture module inside the node already reports `VERSION = '1.9'`. This change moves it to `1.10`. The label
and description are left as they are, because they are not code.

## What changes and why

Today, when you send an email by hand to a tracked contact and its subject matches none of that person's unsent jobs, the capture
writes a Mail_Events row with `manual_sent` / `review` ("no unsent job has this subject ... choose the job it was, or ignore it").
When the person has no unsent job and no tracked thread, it writes `outbound_other` / `review` instead. Either row becomes a to-do
on the Desk. Until you resolve it, the sender holds that person and their firm. The emails you write after a meeting or a reply
end up in this queue, and you then resolve each one on the Desk as `mail_review` / `conversation_sent`.

Capture 1.10 records these emails itself, with the same effects the importer (OR-04, desk_log 3.11) writes for
`mail_review` / `conversation_sent`. It does this only when `conversationOf` can show that the email belongs to an active
conversation:

| | Desk + importer (today) | capture 1.10 |
|---|---|---|
| Mail_Events `classification` | `conversation_sent` | `conversation_sent` |
| Mail_Events `status` | `resolved` | `applied` (the capture's own convention, see below) |
| Mail_Events `activity_id` | the Desk event id | `m<message id>` |
| Mail_Events `resolved_at` / `resolved_by` | now / `<owner> (Desk <event>)` | empty (like every other applied capture row) |
| Activity `action` / `outcome` | `mail_review` / `sent` | `mail_review` / `sent` |
| Activity `channel` / `direction` | `email` / `out` | `email` / `out` |
| Activity `step` / `job_key` / `link_id` / `next_action` | empty | empty |
| Activity `to` | first address of the event's To/Cc | first address of the event's To/Cc |
| Activity `provider_message_id` | the Gmail message id | the Gmail message id |
| Activity `ts` | the email's date (the Desk sends it) | the email's date |
| Activity `notes` | `conversation email outside the sequence "<subject>" (mailbox event <id>)` | the same, followed by `. recorded by the mailbox capture 1.10, <basis>` |
| Activity `logged_by` | `desk` | `capture` |
| Queue | untouched | untouched |

The status is `applied` rather than `resolved` because three safety nets read only `applied` rows whose activity id is
`m<message id>`, and all three then cover the new rows:

- the capture's own reconciliation (1.9), which writes a missing Activity row if a run stops part-way;
- the heartbeat's `capture_effects` check;
- the sender's capture-effects hold.

Readers that look only for `review` (the Desk's to-do list, the sender's holds, the importer's `mail_review` form) treat
`applied` and `resolved` the same way.

### The rule (`conversationOf` in the Capture node)

It runs only in place of the two review outcomes named above. It runs after every content and subject test from 1.4:

- If the body carries the full text of a job, the row stays a review item exactly as today.
- If the subject is the subject of an unsent job, the row stays a review item exactly as today.
- In every case below where the rule cannot show a conversation, the 1.9 review row is written word for word.

**Signals.**

- Person level:
  - a human reply: `replied_positive`, `replied_neutral` or `reply`, not one of ours;
  - a phone conversation: `connected` or `connected_*`, except `connected_not_interested` and `connected_wrong_*`;
  - an active meeting of the person: a meeting id with `meeting_booked` or `meeting_held`, whose latest booked, rescheduled,
    held, cancelled or no-show entry is not `meeting_cancelled` or `meeting_no_show`.
- Account level adds:
  - the same signals from anyone at the firm;
  - a callback request (`callback_requested`);
  - Research `partner_stage` of Conversation or later.

**Unsent jobs.** When the person still has unsent email jobs, three extra conditions apply:

- Only a person-level signal counts.
- Every such job must already be blocked by the gate (Queue `status` = `blocked`).
- No email job of the person may have 60% or more of its reviewed text in the body. Such an email may be a rewritten step, so it
  stays a review item.

**Never.** Any of the following keeps the row a review item:

- A Suppression row that has not been cleared:
  - for the person: contact scope, channel `all`, `email` or empty, any status (an out-of-office hold counts);
  - for the firm: account scope.
- `opt_out`, `bounce`, `not_interested`, `declined`, `no_fit`, `connected_not_interested` or `replied_negative` on record for the
  person.
- Research `partner_stage` is Closed, or `outreach_eligibility` is set to anything other than `eligible`.
- Another tracked recipient of the same email has a job with this subject or text, or fails the same test.

Activity rows voided by `entered_by_mistake` never count. A row corrected by `outcome_corrected` counts only as its correction.

Meetings come from the Activity rows the importer writes for each meeting (`link_id` = meeting id). OR-05 does not read the
Meetings tab. The Research rows were already read by the workflow ("Read Research" runs before Capture); 1.10 passes them to the
capture.

**Inbound mail is unchanged.** `unlinked_inbound` stays a review item and no sentiment is read. Recording a partner's reply that
arrives outside a tracked thread would need a decision about the reply's meaning (`replied_positive`, `neutral` or `negative`)
and a next step. The importer requires both for a reply, so that stays on the Desk. Replies inside the thread of a recorded
conversation email are already linked by thread and recorded as `reply`, as before.

**Existing review rows are not touched.** The rows already in Mail_Events with status `review` are skipped as already recorded.
Resolve them on the Desk as before; the Desk's "conversation emails" action resolves several at once. Only messages captured after
the install use the new rule.

## Files

- `before.js` / `after.js`: the Capture node's code before and after. This is a public copy: the owner's name, the mailbox domain
  and a prospect named in a changelog comment are replaced by placeholders (`OWNER_NAME`, `OWNER`, `OWNER_SURNAME`, `owner_first`,
  `owner_last`, `example.com`, "a contact's"). **Do not paste these into n8n.**
- `test.mjs`: an offline test that runs both files as the Code node runs, with synthetic data. Run it with
  `node n8n/or05-capture-1.5/test.mjs`.
- The installable code is in the private, git-ignored folder `private/n8n/`:

  | File | Contents | sha256 starts with |
  |---|---|---|
  | `OR-05.Capture.before.js` | the live code | `36774f3232b8` |
  | `OR-05.Capture.after.js` | the new code | `b4eca9203bb7` |
  | `OR-05.proposed.json` | the whole workflow with only the Capture code replaced | |

## Install (n8n UI)

1. **Check that the live code is still the reviewed one.** Open the workflow, then the Capture node, and copy its code into a file.
   Its sha256 must start with `36774f3232b8`, the same as `private/n8n/OR-05.Capture.before.js`. If it differs, stop: the
   workflow changed after this was prepared.
2. **Choose a quiet time.** The capture runs every 15 minutes. Publish between runs: no OR-05 execution should be running, and the
   shared lock should not be held by another workflow.
3. **Replace the code.** In the Capture node, select all of the code and paste the full content of
   `private/n8n/OR-05.Capture.after.js`. Leave the other nodes as they are.
   - The alternative is importing `OR-05.proposed.json`. It carries the same nodes, ids, connections and settings. Pasting the one
     node is simpler and cannot touch the settings or credentials.
4. **Save, then Publish.** Do not run it by hand: a manual run reads the real mailbox and writes to the workbook. The next
   scheduled run is the first run of 1.10.

## Verify afterwards (read only)

- **n8n, OR-05 executions.** The next run succeeds. If a conversation email was captured, the Capture Summary output shows
  `statuses.by.conversation_sent` and `child_result.status` = `capture_complete`.
- **Mail_Events.** A hand-sent email to someone in an active conversation gives this row:

  | Column | Value |
  |---|---|
  | `classification` | `conversation_sent` |
  | `status` | `applied` |
  | `confidence` | `high` |
  | `job_key` | empty |
  | `activity_id` | `m<message_id>` |
  | `resolved_at` / `resolved_by` | empty |
  | `reason` | starts with `sent by hand to <contact>: a conversation email, not a sequence step (their ...` |

  An email whose subject or text is a sequence step still gives `manual_sent` / `review`, exactly as before.
- **Activity.** One row per such email:

  | Column | Value |
  |---|---|
  | `activity_id` | `m<message_id>` |
  | `action` | `mail_review` |
  | `outcome` | `sent` |
  | `channel` | `email` |
  | `direction` | `out` |
  | `step` / `job_key` / `link_id` | empty |
  | `logged_by` | `capture` |
  | `provider_message_id` | the message id |
  | `to` | the first recipient |
  | `notes` | `conversation email outside the sequence "<subject>" (mailbox event <id>). recorded by the mailbox capture 1.10, person level: their <outcome> <date>` |

- **Queue.** No row changes because of a conversation email.
- **Desk.** No new to-do for these emails, and no sender hold for that person or firm.
- **OR-11 heartbeat.** `capture_effects` stays without misses. `versions` reports a difference; see the next section.

## OR-11 heartbeat baseline

OR-11 compares each monitored workflow with the release baseline in its **Config** node, field `expected_versions`. That field
holds JSON with three parts:

- `baseline`: a text history, newest entry first, each older one after "previous:";
- `workflows[<id>].version`: the published version id that is expected;
- `modules["<WF>/<node>"]`: the module versions read from the published code.

After this install, the hourly versions check reports two differences:

- the OR-05 published version id is not the baseline's;
- `OR-05/Capture: BlocksSchedule 1.4, BlocksCapture 1.10, BlocksMailbox 1.0 (baseline BlocksSchedule 1.4, BlocksCapture 1.9, BlocksMailbox 1.0)`.

To update the baseline, edit OR-11's Config node and publish OR-11. That is a separate step, done only after you accept the
install. Make three changes:

1. Set `workflows["0dbM37DbT0GTUgDT"].version` to the new published version id.
2. Set `modules["OR-05/Capture"]` to `BlocksSchedule 1.4, BlocksCapture 1.10, BlocksMailbox 1.0`.
3. Add a new entry at the front of `baseline`, for example `"<date> OR-05 capture 1.10 conversation emails (<new version id>); previous: ..."`.

OR-11 checks its own version by content, not by version id. Nothing in OR-11 changes as part of this install.

## Rollback

There are two ways back:

- **Restore from history.** In OR-05, open the version history and choose the version published on 2026-10-15 at 13:25 UTC. It is
  the version the OR-11 baseline names. Restore it, then Publish.
- **Paste the old code back.** Paste `private/n8n/OR-05.Capture.before.js` back into the Capture node, then Save and Publish.

After a rollback, the heartbeat matches its baseline again.

Rows that 1.10 already wrote stay in the workbook: the `conversation_sent` / `applied` Mail_Events rows and their Activity rows.
They record what the Desk would have recorded for the same emails, so nothing needs undoing. If you want them back as review items,
that is a manual workbook edit, and it is not recommended.
