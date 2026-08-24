---
name: bootstrap-shared-drive
description: >
  Generate or refresh the CLAUDE.md for a Google Shared Drive opened as a
  Cowork project, based on the drive's emoji-prefix type: 👤 client-centric
  (domain holder = Coaching, essential context = the Praxis Client, resolved
  via Praxis MCP tools, never raw HubSpot), ◉ Holacracy circle/role (domain
  holder = the matching GlassFrog role, resolved live), or a fallback
  template for unrecognized prefixes. Use when a new Shared Drive is being
  set up as a Cowork project, when an existing drive's CLAUDE.md has
  drifted from its role/Client, or when the user says "set up this drive",
  "generate a CLAUDE.md for this drive", "this is a client drive", "this is
  a circle drive", or names a Shared Drive by its 👤 or ◉ prefix.
status: draft
version: 0.1.0
---
# Bootstrap a Shared Drive CLAUDE.md

## When to use

- A new Google Shared Drive has just been created to serve as a Cowork
  project root and needs its first CLAUDE.md.
- An existing Shared Drive's CLAUDE.md is missing the standard sections
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
- **Never hand-copy a GlassFrog role's purpose/accountabilities/domains
  into a ◉ drive's CLAUDE.md as static prose without also resolving them
  live at generation time.** Stale role text is worse than no template at
  all.
- **Never guess a domain holder for a drive with no recognized prefix.**
  Use the fallback template and leave the domain-holder line as an open
  question for the human, per
  [SAE-015](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-015-shared-drive-claude-md-standard.md).
- **Never overwrite an existing CLAUDE.md's custom "Working in this drive"
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

### Step 2 — Resolve essential context live

- **client**: Call `praxis_search` (or `praxis_list_clients`) with the
  drive's `<Name>` to find the matching Praxis Client. Call
  `praxis_get_client` for full detail. If a HubSpot contact link is
  available from the Praxis record, include it as identification-only. If
  Praxis is not connected, stop and tell the user — do not fall back to
  `mcp__hubspot__*`.
- **circle-role**: Call `glassfrog_search` (or `glassfrog_list_roles`) with
  the drive's `<Name>` to find the matching role. Call `glassfrog_get_role`
  for purpose, accountabilities, domains, parent circle, and fillers. If
  GlassFrog is not connected, ask the user which role/circle to treat as
  domain holder rather than guessing.
- **fallback**: No live resolution — leave the domain-holder and
  essential-context blocks as open questions for the human.

### Step 3 — Fill the matching overlay template

Load `templates/base-CLAUDE.md` and the type-matched overlay
(`templates/client-CLAUDE.md`, `templates/circle-role-CLAUDE.md`, or
`templates/fallback-CLAUDE.md`), substitute the resolved values, and stamp
the provenance footer with today's date and this skill's version.

### Step 4 — Write and confirm

Write the result to `CLAUDE.md` at the drive's root. If a CLAUDE.md
already exists, show a diff of the header sections only (domain holder,
essential context, provenance) and confirm before overwriting; preserve
any "Working in this drive" bullets the human already added.

## Cross-references

- Standard: [SAE-015: Google Shared Drive CLAUDE.md Standard by Drive Type](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-015-shared-drive-claude-md-standard.md)
- Sibling architecture: [SAE-004: Claude Code Context Architecture](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-004-claude-code-context-architecture.md) (git-repo tiers; this skill covers the Shared Drive root SAE-004 doesn't)
- Coaching plugin invariants: [`integral-productivity-coaching-claude-plugin/CLAUDE.md`](https://github.com/Integral-Productivity/integral-productivity-coaching-claude-plugin/blob/main/CLAUDE.md)

## Sibling skills in this plugin

- `bootstrap-mcp-server`, `bootstrap-private-sdk`, `bootstrap-sync-connector`,
  `devops-excellence-cold-start` — same bootstrap family, different context
  root (git repos, not Shared Drives).

## Promote to `tested` when

- The skill has generated CLAUDE.md files for at least one real drive of
  each type (👤, ◉, fallback) and a human has confirmed the output matches
  the drive's actual domain holder and essential context.
- The "never overwrite hand-added bullets" behavior has been exercised at
  least once against a drive with existing custom content.
