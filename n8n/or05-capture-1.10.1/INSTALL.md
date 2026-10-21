# OR-05 capture 1.10.1: conversation emails stop being review items

Workflow **BLOCKS-OR-05 v2 | Capture Mailbox** (n8n id `0dbM37DbT0GTUgDT`). One node changes: the Code node **Capture**
(capture module 1.9 → 1.10.1). It replaces the 1.10 proposal in `../or05-capture-1.5/`, which was not installed: replaying 1.10
against the gate, the sender and the Desk showed it could move backup timing, change follow-up threading and count a deferral as a
conversation.

**Status: installed 21 Oct 2026.** OR-05 version `ba47da75-1af9-48e6-9dc5-78aaf0b50fb6` (published 07:33 UTC; previous
`2c66357b`). OR-11 version `560fcc3d-0b17-47b7-93d6-8bf8515ae0e0` expects it (previous `8978701b`). A draft made from the public
placeholder copy (`736d215c`) was briefly the published version before `ba47da75`; the one scheduled run on it (07:30 UTC)
read no message bodies and wrote nothing, so it had no data effect.

## What it does

A hand-sent email to a tracked person that matches no sequence step today becomes a Mail_Events row `manual_sent` (or
`outbound_other`) with status `review`: a to-do on the Desk, and the sender holds that person until it is resolved. 1.10.1 marks
such an email resolved by itself, **only** when all of this holds:

- every existing subject and text test ran first and found no sequence step (unchanged 1.4 logic);
- the person has their own reply (`replied_positive`, `replied_neutral`), phone conversation (`connected_interested`,
  `connected_info_requested`, `connected_redirect`) or an active meeting, on a row the gate files under the same person key;
- nothing ended it: no opt-out, bounce, decline, "no interest for now", negative reply, declined agreement, cancelled or missed
  meeting at the firm, and no pause, after that signal; no suppression, no ineligible or Closed account;
- every unsent email job of the person is already blocked by the gate, and none of their job texts is 60% or more in the body;
- every tracked co-recipient passes the same test.

What it writes: the Mail_Events row only, `classification conversation_sent`, `status resolved`, `confidence high`,
`resolved_at` now, `resolved_by "mailbox capture 1.10.1 (conversation email)"`. **No Activity, Queue or Suppression row.**
Incoming mail is unchanged: replies outside a tracked thread stay review items.

## Why it cannot enable outreach

- The gate stops all unsent outreach to a person with a reply, meeting or phone conversation on file, keyed exactly as 1.10.1 keys
  its signal; Activity rows are only ever added, so that stop is permanent. The review hold 1.10.1 removes is therefore never the
  thing that holds that person's email.
- The gate reads no Mail_Events. Activity, Queue and Suppression are unchanged. The sender's thread history and capture-effects
  hold read only `applied` rows, so `resolved` rows are invisible to them, exactly like rows resolved on the Desk today.

Evidence (offline, on a copy of the 20 Oct 2026 workbook and the live workflow code):

- `node n8n/or05-capture-1.10.1/test.mjs`: 9 groups, about 30 scenarios against 1.9 (all guards deep-equal to 1.9).
- Sender (OR-03 Gate → Pre-send Guard → Split Batch → Final Batch), old vs after-1.10.1, two clocks, normal and wide batch:
  0 of 2,266 jobs differ.
- Property check over all 467 contacts, and a randomized check (3 seeds, 1,620 people with random histories, corrections, voids,
  pauses and key mismatches): for every person 1.10.1 accepts, every unsent email job forced to approved plus a new approved
  Email 1 is blocked by the live gate with a permanent person stop: 0 violations in 297 jobs. A deliberately broken classifier
  fails the same check (37 violations), so the check has teeth.
- Desk: the accepted events leave the review list; one reply that the review item had masked becomes visible.

On 20 Oct data it would have resolved 7 of the 14 open hand-sent reviews (3 people) and kept 7 for review (a later pause or a
cancelled meeting at the firm).

## Install

1. Read the live workflow; its Capture code must equal the reviewed 1.9 code (private `OR-05.Capture.before.js`, sha256
   `36774f32…`). If not, stop.
2. Set the Capture node's code to the **private** file (`n8n/OR-05.Capture.1.10.1.js.txt` in the private backups: 152,546
   characters, first line `// BLOCKS schedule engine, version 1.3`, and the word OWNER appears nowhere in it). The `after.js` in this
   folder is a public review copy with placeholders; since 21 Oct it refuses to run if pasted. Save it as a draft. Read the draft back: its code must match the file
   byte for byte. Only then publish.
3. Update OR-11's `expected_versions` for this workflow only: the new published version id and module `BlocksCapture 1.10.1`.

## Verify (read only)

- The next scheduled OR-05 run succeeds.
- New Mail_Events rows: a hand-sent email to someone who replied shows `conversation_sent` / `resolved`; anything else as before.
- No new Activity row with `logged_by capture` and `action mail_review`. Queue unchanged by the capture.
- OR-11: `capture_effects` ok, `versions` without a new difference.

## Deployment record (21 Oct 2026, all times UTC)

| When | What |
|---|---|
| 07:25:18 | A draft made by pasting the **public** `after.js` (placeholders, no guard yet) is saved as version `736d215c`. |
| after 07:27:22 | `736d215c` becomes the published version (at 07:27:22 the published version was still `2c66357b`). |
| 07:30:35 | OR-05 run `39223` on `736d215c`: `new_ids 0, bodies_read 0, applied 0, review 0`. |
| 07:33:58 | The verified private code is saved as version `ba47da75` (Capture read back byte-identical, sha256 `1b993e2a…`, 152,546 characters; no other node, connection or setting changed). |
| 07:34:35 | `ba47da75` published. Exposure of `736d215c`: at most 07:27:22 to 07:34:35, one scheduled run. |
| 07:45:34 | OR-05 run `39252` on `ba47da75`: `new_ids 1, unrelated_counted_only 1, bodies_read 0, applied 0, review 0`. |
| 07:46 | OR-11 version `560fcc3d` published: `expected_versions` changed for OR-05 only (read back equal to the prepared value). |
| 08:00:36 | OR-05 run `39261`: `new_ids 0`, nothing read or written. |
| 08:01:05 | OR-11 run `39263`: versions `14/14 read, 2 differences`, the two that were already there (OR-06 `efbf11d8` vs `854ca69a`, OR-07 `23e91790` vs `cafcf6d4`); no OR-05 difference. capture `ok`, failures `0`, capture_effects unchanged (`partial`, the check that does not cover out-of-office holds yet). |

No data effect from `736d215c`: run `39223` reported no new message, and its counters are all 0. The newest Mail_Events row is
still from 03:30:38 (run `39101`), and the newest Activity row from 03:30:38 (OR-03). The capture wrote no Suppression row
(the one row added on 21 Oct is a manual account hold whose source is Itamar's instruction, not the capture).
OR-05 keeps no successful runs, so this rests on the run reports in Config and on the tabs themselves.

**The new rule has not run on a real message yet.** No hand-sent email to a tracked person has arrived since the install, so
`conversation_sent` has not been written live. Verification of it stays open until one arrives. Then check: one Mail_Events row
`conversation_sent` / `resolved` / `resolved_by "mailbox capture 1.10.1 (conversation email)"` for a person with their own reply,
call or meeting and no later ending; no Activity, Queue or Suppression row from it; anything else classified as under 1.9.

Which code to install: only the private `OR-05.Capture.1.10.1.js.txt` in the private backups. `after.js` and `before.js` here are
sanitized review copies; since 21 Oct they throw on their first line if run.

## Rollback

First read the OR-05 and OR-11 version history. If either has a newer version than `ba47da75` / `560fcc3d` (someone else's
change), do not restore a whole old version over it: set only the Capture node's code back to the private 1.9 file
(`OR-05.Capture.1.9-live.js.txt`, sha256 `36774f32…`) and only OR-11's `expected_versions` back to the copy saved in the private
backups (`OR-11.before-8978701b.json`), read both back, then publish. If neither changed, restoring OR-05 `2c66357b` and
OR-11 `8978701b` and publishing both does the same.

Data: rows 1.10.1 already marked resolved stay resolved after a code rollback; they record the same thing a Desk resolution
would (minus an Activity row). To bring one back as a review item, set its Mail_Events `status` to `review` by hand.
