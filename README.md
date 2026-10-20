# Blocks Partner Desk: source, tests and prepared workflow changes

This repository holds the code of the **Blocks Partner Desk** (the claude.ai page used every day for partner outreach) and changes
prepared for the **Partner Engine** n8n workflows. It is a **public** repository, so it never contains prospect data: every line of
the Desk that carries names, research, phone numbers or workbook ids is replaced by a marker and kept in a private, git-ignored file.

## How the pieces fit

```
Gmail mailbox ──OR-05 capture──▶ ┐
Aircall ───────AC-03 events────▶ │
Google Calendar ─CAL-01 slots──▶ │   Google Sheets workbook "Blocks - Partner Lead Engine"
Research/prep ──OR-06, OR-07──▶ │   (Companies, Contacts, Research, Queue, Activity, Meetings,
                                 │    Mail_Events, Desk_Import, Config, Health, Health_Checks, ...)
Desk entries ──OR-04 importer──▶ ┘
                                     │                    ▲
       OR-02 gate, OR-03 sender ◀────┘                    │ one JSON file per entry, written to the
       OR-10 failures, OR-11 heartbeat                    │ Desk log inbox folder in Google Drive
                                                          │
Partner Desk (claude.ai page) ── reads the workbook as an .xlsx export through your Google Drive connector
```

- The Desk never writes the workbook. Every action you take saves one small entry file; the importer (OR-04) checks it again
  and applies it, or refuses it with a reason the Desk shows. The importer drops repeats of the same entry.
- Approvals, opt-outs, suppressions, do-not-call holds and sending limits live in the workbook and the workflows. Nothing here
  removes or weakens any of them.

## What changed in this branch (Desk r12)

Found on the live data of 20 Oct 2026; each change has a test.

1. **One task per person for mailbox events.** "Do now" had 35 tasks; 24 were single mailbox events from six accounts already in
   a meeting or conversation (your own hand-written emails and their answers). They are now one row per person, with the account's
   situation, and one button that records the emails you wrote as conversation emails. Every message stays listed under the row.
   On the same data, Do now goes from 35 to 18 tasks.
2. **Refusals you caused are not "fix" tasks.** Entries refused only because you withdrew their confirmation are settled. A
   withdrawal that came too late is a plain note (it stands, how to change it), not "Fix and save again".
3. **Callbacks say how overdue they are.** An open callback shows the working days since your last try and their next
   10:00 to 11:00 calling hour in their time and in Israel time. Nothing is closed or moved for you.
4. **No false "calendar late" alarm** in the evening or at the weekend: the Desk now uses the heartbeat's own verdict and the
   calendar check's real schedule.
5. **Preview builds** read the live workbook but cannot save anything.

Prepared, **not installed**: OR-05 capture 1.10 (`n8n/or05-capture-1.5/`), which records those conversation emails
automatically so they never become to-dos. See its `INSTALL.md`.

## Build and test

Requirements: Node 20+ with Playwright, Python 3 with pandas and openpyxl, and (for production builds and tests) the private
files and a workbook export.

```
node tools/build.mjs --mode synthetic          # public stand-ins, no prospect data
node tools/build.mjs --mode production         # needs private/desk-private.json
node tools/build.mjs --mode preview            # production data, saving disabled, PREVIEW banner
tools/test.sh <workbook.xlsx> [published.html] # everything below, in order
```

`tools/test.sh` runs: the three builds; a check that the baseline rebuild equals the published page byte for byte; the leak check
on every public file; a sanitized fixture of five accounts (`tools/make_fixture.py`, pseudonyms only, written to `private/`); the
r12 acceptance checks on that fixture (`tools/steps/r12-fixture.mjs`, which fail on the published Desk and pass on r12); the
preview check (no save reaches Google Drive); and a phone-width check (no sideways scrolling at 390 px).
`node n8n/or05-capture-1.5/test.mjs` runs the 14 offline checks of the capture change.

`tools/harness.mjs` opens a build in headless Chromium with the claude.ai runtime replaced by a stub: the workbook comes from a
local file and every save is captured in memory. Nothing leaves the machine.

### Recreating the private files

`private/` is git-ignored. To recreate it, read the live Desk artifact, save it as `desk/index.html` and run
`node tools/split.mjs desk/index.html`. If the live Desk changed since the baseline commit, apply this branch's commits on top of
the new split before building.

## Deploying the Desk

Deployment republishes the existing Desk artifact. It changes what you see, not any data or rule.

1. Read the live Desk and confirm it is still the 18 Oct 2026 version this branch started from. If it changed, re-split it and
   rebase these commits first.
2. `tools/test.sh <fresh workbook export> desk/index.html` passes.
3. Build production and republish it to the same artifact, keeping its stored capabilities (the db rule and the two Google Drive
   tools) unchanged.
4. Open the Desk, press Refresh, and check that Today shows the grouped mailbox rows and the callback ages.

**Rollback:** republish the baseline build (`git checkout "$(git rev-list --max-parents=0 HEAD)" -- desk/src && node tools/build.mjs --mode production`), or restore
the previous version from the artifact's history. Entries saved with r12 are ordinary desk log entries and need no undoing.
