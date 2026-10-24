---
name: bootstrap-shared-drive
description: >
  Generate or refresh the agent context for a Google Shared Drive opened as
  a Cowork project: a canonical AGENTS.md plus a CLAUDE.md stub that imports
  it, migrating a drive that still has a full CLAUDE.md. Output depends on
  the drive's emoji-prefix type: 👤 client-centric (domain holder =
  Coaching, essential context = the Praxis Client, resolved via Praxis MCP
  tools, never raw HubSpot), ◉ Holacracy circle/role (domain holder = the
  matching GlassFrog role, resolved live), or a fallback template for
  unrecognized prefixes. Use when a new Shared Drive is being set up as a
  Cowork project, when an existing drive's AGENTS.md or CLAUDE.md has
  drifted from its role/Client, or when the user says "set up this drive",
  "generate a CLAUDE.md for this drive", "generate an AGENTS.md for this
  drive", "this is a client drive", "this is a circle drive", or names a
  Shared Drive by its 👤 or ◉ prefix.
status: draft
version: 0.2.0
---
# Bootstrap a Shared Drive AGENTS.md

The drive's canonical context file is `AGENTS.md`, so any agent reads one
file. `CLAUDE.md` is a stub that imports it (`@AGENTS.md`), because Claude
Code reads `CLAUDE.md` first when both exist. See
[SAE-023](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-023-shared-drive-context-lives-in-agents-md.md).
The template files keep their `-CLAUDE.md` names; they render `AGENTS.md`.

## When to use

- A new Google Shared Drive has just been created to serve as a Cowork
  project root and needs its first AGENTS.md.
- An existing Shared Drive's AGENTS.md (or its full CLAUDE.md, before
  migration) is missing the standard sections
  (domain holder, essential context, provenance) or was hand-edited out of
  sync with its live GlassFrog/Praxis data.
- The user names a drive by its emoji prefix (👤 or ◉) and asks to set it
  up, document it, or explain what it's for.

## Hard constraints

- **Never call `mcp__hubspot__*` directly for a 👤 client drive's Client
  data.** Per `integral-productivity-coaching-claude-plugin`'s "Praxis SDK
  is the only door" invariant, all Client/Encounter/Engagement data goes
  through the Praxis MCP tools (`praxis_get_client`, `praxis_search`,
  `praxis_list_encounters`, etc.). The HubSpot contact link in the template
  is identification-only.
- **Never write a GlassFrog role's purpose, accountabilities, domains, or
  fillers into a ◉ drive's AGENTS.md.** Write only the stable identifiers
  (role name, role ID, parent circle) plus the lookup directive from the
  template, so each session reads the role live from GlassFrog. A copy made
  at generation time goes stale on the next governance change, and stale
  role text is worse than no template at all. See
  [SAE-016](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-016-circle-drive-context-is-looked-up-live.md).
- **Never write a Coach-facing artifact into a 👤 drive's Client-named
  folder.** A client drive is two audiences in one root: `_Internal/` is
  Coach-only, and the `<Client Name> – <Program>/` folder is shared with the
  Client. Retention/winback analysis, the Coach's commercial stake, hypotheses
  about the Client's motives, raw developmental material, pricing, and unsent
  outreach all go in `_Internal/`. Default to `_Internal/` when unsure — see
  [SAE-015](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-015-shared-drive-claude-md-standard.md)
  Decision part 4.
- **Never guess a domain holder for a drive with no recognized prefix.**
  Use the fallback template and leave the domain-holder line as an open
  question for the human, per
  [SAE-015](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-015-shared-drive-claude-md-standard.md).
- **Never write a file inventory, or the file ID of `AGENTS.md` or
  `CLAUDE.md`,** into either file or into a Claude Project. Write the Shared
  Drive ID and, at most, top-level folder IDs. Sessions find files live. See
  [SAE-020](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-020-shared-drive-context-is-reached-through-the-drive-connector.md).
- **Never put rules in the `CLAUDE.md` stub.** It holds the stub template's
  two lines only. Connector sessions and other agents read `AGENTS.md`, not
  the stub, so a rule in the stub reaches only some sessions.
- **Never overwrite an existing AGENTS.md's (or, before migration, a full
  CLAUDE.md's) custom "Working in this drive"
  bullets** below the standard header sections — regenerate the domain
  holder/essential context/provenance blocks only, and ask before touching
  hand-added content.

## Algorithm

### Step 1 — Identify the drive type from its name

Read the Shared Drive's name (via `mcp__google-drive__*`, or the folder
name as seen in the Cowork project). Match the leading character:

- `👤 <Name>` → **client** type. `<Name>` is the Client's display name.
- `◉ <Name>` → **circle-role** type. `<Name>` is the circle or role name as
  it appears in GlassFrog.
- Anything else → **fallback** type.

Also record the **Shared Drive ID** (it starts with `0A`). The Drive
connector returns it as the `parentId` of any file at the drive root.
Substitute it into `<DRIVE_ID>`.

### Step 2 — Resolve essential context live

- **client**: Call `praxis_search` (or `praxis_list_clients`) with the
  drive's `<Name>` to find the matching Praxis Client. Call
  `praxis_get_client` for full detail. If a HubSpot contact link is
  available from the Praxis record, include it as identification-only. If
  Praxis is not connected, stop and tell the user — do not fall back to
  `mcp__hubspot__*`.
- **circle-role**: Call `glassfrog_search` (or `glassfrog_list_roles`) with
  the drive's `<Name>` to find the matching role. Call `glassfrog_get_role`
  with `include: ["parent_role"]` to confirm the match and get the role ID
  and parent circle name. These identifiers are the only role data the
  AGENTS.md holds; the template's lookup directive tells each session to
  read purpose, accountabilities, domains, and fillers live. If GlassFrog is
  not connected, ask the user which role/circle to treat as domain holder
  rather than guessing.
- **fallback**: No live resolution — leave the domain-holder and
  essential-context blocks as open questions for the human.

### Step 3 — Fill the matching overlay template

Load `templates/base-CLAUDE.md` and the type-matched overlay
(`templates/client-CLAUDE.md`, `templates/circle-role-CLAUDE.md`, or
`templates/fallback-CLAUDE.md`), substitute the resolved values, and stamp
the provenance footer with today's date and this skill's version. The
result is the content of `AGENTS.md`.

### Step 3b — Create the confidentiality zone (👤 drives only)

Create `_Internal/` at the drive root if it does not exist, so the destination
for Coach-facing artifacts exists before anything needs to be written to it.
Identify the Client-facing folder (the one named after the Client) and
substitute its actual name into `<CLIENT_FACING_FOLDER>` in the template —
resolve it from disk rather than constructing it, since these folder names
frequently contain en-dashes and non-breaking spaces that break typed paths.

Do **not** create a zone for ◉ or fallback drives — they have no external-party
audience and the split would be noise.

### Step 3c — Fill the folder map

List the drive root with the Drive connector (`parentId = '<DRIVE_ID>'`).
Replace `<FOLDER_MAP>` with a `### Folder map` table: each top-level folder's
title, its folder ID, and its use. For a 👤 drive, mark `_Internal/` as
Coach-only and the Client-facing folder as Client-facing. Add one line above
the table: "If a folder ID fails, search for the folder by title and tell the
human." List folders only. Do not list files.

If the drive has no folders yet, remove `<FOLDER_MAP>`.

### Step 4 — Write and confirm

Write two files at the drive root: `AGENTS.md` (the rendered templates) and
`CLAUDE.md` (the stub from `templates/stub-CLAUDE.md`, unchanged). Ask
before you write either one; both are drive-root files. First check which
of the two already exist. Use the same query as the write check below
(`title = '<TITLE>' and parentId = '<DRIVE_ID>'`, following `nextPageToken`
until it is absent), because just after a replacement the first page can be
empty. Then take the one action for that state:

| Drive root holds | Action |
|---|---|
| Neither file | Write `AGENTS.md`, then the stub `CLAUDE.md`. |
| A full `CLAUDE.md`, no `AGENTS.md` (the pre-SAE-023 shape) | Migrate: render `AGENTS.md`, carry over the "Working in this drive" bullets and any other sections the human added to `CLAUDE.md`, show the human the result, then write `AGENTS.md` and replace `CLAUDE.md` with the stub. |
| `AGENTS.md` and the stub `CLAUDE.md` | Regenerate: show a diff of the header sections of `AGENTS.md` only (domain holder, essential context, provenance), confirm, and keep its hand-added bullets. Leave the stub as it is. |
| `AGENTS.md` and a `CLAUDE.md` that is not the stub (an interrupted migration, or a regeneration by an older version of this skill) | `AGENTS.md` is canonical. Show the human the "Working in this drive" bullets and sections found only in `CLAUDE.md`, ask which to keep, merge those into `AGENTS.md`, then replace `CLAUDE.md` with the stub. |
| `AGENTS.md`, no `CLAUDE.md` | Regenerate `AGENTS.md` as in the third row, then write the stub `CLAUDE.md`. |
| The stub `CLAUDE.md`, no `AGENTS.md` | Stop and ask the human. The canonical file is missing; do not render a new `AGENTS.md` without confirmation, because its hand-added sections may be lost. |
| More than one file with either title | Stop and ask the human. Show each file's `modifiedTime` and whether it is the stub. |

A `CLAUDE.md` is the stub when its only non-empty lines are the stub
template's two lines.

**Through the Drive connector** (a cloud session, no local mount): create
each file with `create_file`, `parentId: <DRIVE_ID>`, `contentMimeType:
text/markdown`, and `disableConversionToGoogleType: true`. The connector
cannot change an existing file's content, so to replace a file: create the
new one, then trash the old one. Write `AGENTS.md` before the stub, so an
interrupted run leaves the canonical file in place (the fourth row above
recovers it). Then, for each title, run the query
`title = '<TITLE>' and parentId = '<DRIVE_ID>'` with `<TITLE>` set to
`AGENTS.md` and then `CLAUDE.md`, and confirm each returns exactly one file.
Follow `nextPageToken` until it is absent: just after a replacement, the
first page can be empty.

### Step 5 — Give the Claude Project pointer

If the drive will be used from a Claude Project, give the human this text
for the Project's instructions. Do not write it into a Project doc instead:
Project instructions load in every session, and Project docs do not.

> The `<DRIVE_NAME>` Google Shared Drive (ID `<DRIVE_ID>`) is the only
> source of truth. Before any work, read its `AGENTS.md`: Google Drive
> `search_files` with `title = 'AGENTS.md' and parentId = '<DRIVE_ID>'`,
> following `nextPageToken` until it is absent. Do not read the
> `CLAUDE.md` stub instead; it only imports `AGENTS.md`. Do not add Project
> docs that copy or list drive files.

Name the file by drive ID, title, and parent only. Never put a file ID in
this text: each revision through the connector gives the file a new ID.

## Cross-references

- Standard: [SAE-015: Google Shared Drive CLAUDE.md Standard by Drive Type](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-015-shared-drive-claude-md-standard.md)
- ◉ drive rule: [SAE-016: ◉ Circle/role drive context is looked up live, not copied](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-016-circle-drive-context-is-looked-up-live.md) (supersedes the ◉ overlay clause of SAE-015)
- Access and location rule: [SAE-020: Shared Drive context is reached through the Drive connector, and a Claude Project points to it by location](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-020-shared-drive-context-is-reached-through-the-drive-connector.md) (amends the SAE-015 base template)
- File names: [SAE-023: Shared Drive context lives in AGENTS.md, and CLAUDE.md only imports it](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-023-shared-drive-context-lives-in-agents-md.md) (Proposed; amends SAE-015 part 1 and SAE-020 parts 2, 3, 6)
- Sibling architecture: [SAE-004: Claude Code Context Architecture](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-004-claude-code-context-architecture.md) (git-repo tiers; this skill covers the Shared Drive root SAE-004 doesn't)
- Coaching plugin invariants: [`integral-productivity-coaching-claude-plugin/CLAUDE.md`](https://github.com/Integral-Productivity/integral-productivity-coaching-claude-plugin/blob/main/CLAUDE.md)

## Sibling skills in this plugin

- `bootstrap-mcp-server`, `bootstrap-private-sdk`, `bootstrap-sync-connector`,
  `devops-excellence-cold-start` — same bootstrap family, different context
  root (git repos, not Shared Drives).

## Promote to `tested` when

- The skill has generated AGENTS.md files for at least one real drive of
  each type (👤, ◉, fallback) and a human has confirmed the output matches
  the drive's actual domain holder and essential context.
- The "never overwrite hand-added bullets" behavior has been exercised at
  least once against a drive with existing custom content.
- A drive with a full CLAUDE.md has been migrated to AGENTS.md plus the
  stub, with its hand-added sections kept.
- A 👤 drive has been bootstrapped with `_Internal/` created and
  `<CLIENT_FACING_FOLDER>` correctly resolved from disk.
