## Domain holder

**Coaching** (GlassFrog role `role_50cd195cf63247a9b9ef2f8bb1d578b1`) is the
domain holder for this drive.

This file does not hold the role's purpose, parent circle, accountabilities,
or domains. When the work depends on them, call `glassfrog_get_role` with
that role ID and `include: ["parent_role"]`. If GlassFrog is not connected,
ask the human. Do not guess.

## Essential context

This drive is scoped to one Client: **<CLIENT_NAME>**.

- HubSpot Contact ID (the key Praxis uses for this Client): `<HUBSPOT_CONTACT_ID>`

This file does not hold the Client's Engagement stage or any other Client
state. That data changes, and this file is outside `_Internal/`. When the
work needs Client data, look it up in Praxis:

1. Call `praxis_get_client` with `hubspotContactId: <HUBSPOT_CONTACT_ID>` to
   confirm the Client.
2. Use the same ID as `clientId` for `praxis_list_encounters`,
   `praxis_search`, and the other Praxis tools.
3. If the ID does not resolve, tell the human that this CLAUDE.md needs
   regeneration. Do not read HubSpot directly.

If Praxis is not connected, stop the work that needs Client data and tell the
human. Work that needs no Client data (for example, filing a document) can
continue under the zone rules below.

**Use Praxis, not HubSpot, to work with this Client's data.** The coaching
plugin's "Praxis SDK is the only door" invariant applies here too: never call
`mcp__hubspot__*` directly against this Client's contact record. The Contact
ID above identifies the record. It is not permission to read HubSpot.

Use Praxis Ubiquitous Language: **Client**, not "contact" or "co-learner";
**Encounter**, not "session"; **Engagement**, not "deal" or "pipeline
stage" in prose.

## Where things go — internal vs Client-facing

**This drive has two zones. Default to `_Internal/`.**

| Zone | Path | Who it is for |
|---|---|---|
| **Coach-only** | `_Internal/` | Never shared with the Client. Anything *about* the Client. |
| **Client-facing** | `<CLIENT_FACING_FOLDER>` | The Client's own materials. Assume the Client sees everything here. |

The Client-facing folder is named after the Client and holds their working
documents, recordings, and reports. **It is theirs.** Do not put Coach
artifacts there.

If the Client-facing folder named above does not exist (for example, it was
renamed), list the drive root, tell the human, and write to `_Internal/`
until it is resolved.

**Always `_Internal/`, no exceptions:**

- Winback, retention, downsell, renewal, and churn analysis
- Anything naming the Coach's stake — revenue, sunk cost, pipeline value
- Hypotheses about *why* the Client did something, or about their psychology
- Raw developmental material — DevOpp/Insight dumps, Stratum or action-logic
  attributions not yet shaped for the Client
- Engagement reviews, pricing, contract strategy
- Draft outreach the Client has not received yet

**Client-facing only when the artifact was made to be handed over** — something
co-created in an Encounter, a report you would read aloud together, something
already sent.

**If you are unsure, it goes in `_Internal/`.** Over-classifying costs nothing;
a Client reading a strategy document about themselves costs the relationship.
The test: *would I be comfortable if the Client opened this without me in the
room?* If the honest answer is "only if I could frame it first," it is internal.

Coaching commands (`/coaching:winback`, `engagement-review`, `renewal-prep`,
`expansion-review`) emit Coach-facing analysis and do **not** choose a zone for
you. Decide the destination before writing, not after.

> `_Internal/` is a convention backed by **Drive sharing permissions**, not by
> the filesystem. It protects nothing unless the Client-facing folder is the
> only surface actually shared with the Client. If the Client is a full Shared
> Drive member, the folder name does no work — verify sharing rather than
> assuming.

## Working in this drive

- Treat everything in this drive as confidential coaching data. Do not
  summarize or forward its contents outside a coaching context without the
  Client's consent.
- Cross-reference the
  [`integral-productivity-coaching-claude-plugin`](https://github.com/Integral-Productivity/integral-productivity-coaching-claude-plugin)
  skills (`encounter-prep`, `encounter-debrief`, `engagement-progress-review`,
  etc.) for structured coaching workflows rather than improvising them here.
