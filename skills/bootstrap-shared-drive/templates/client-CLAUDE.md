## Domain holder

**Coaching** (GlassFrog role `role_50cd195cf63247a9b9ef2f8bb1d578b1`, within
the Client Relations → Coaching line) is the domain holder for this drive.
Purpose: "Provide service and support to customers who want hands-on
support to become more integrally productive."

## Essential context

This drive is scoped to one Client: **<CLIENT_NAME>**.

- Praxis Client record: <PRAXIS_CLIENT_ID_OR_RESOLVE_VIA_PRAXIS_SEARCH>
- HubSpot contact (system of record, for cross-reference only): <HUBSPOT_CONTACT_URL>
- Current Engagement stage: <ENGAGEMENT_STAGE>

**Use Praxis, not HubSpot, to work with this Client's data.** The coaching
plugin's "Praxis SDK is the only door" invariant applies here too: pull
Client, Encounter, and Engagement context with `praxis_get_client`,
`praxis_search`, `praxis_list_encounters` / `praxis_list_upcoming_encounters`,
and related Praxis tools — never `mcp__hubspot__*` directly against this
Client's contact record. The HubSpot link above identifies which record
this is; it is not the interaction surface.

Use Praxis Ubiquitous Language: **Client**, not "contact" or "co-learner";
**Encounter**, not "session"; **Engagement**, not "deal" or "pipeline
stage" in prose.

## Working in this drive

- Treat everything in this drive as confidential coaching data. Do not
  summarize or forward its contents outside a coaching context without the
  Client's consent.
- Cross-reference the
  [`integral-productivity-coaching-claude-plugin`](https://github.com/Integral-Productivity/integral-productivity-coaching-claude-plugin)
  skills (`encounter-prep`, `encounter-debrief`, `engagement-progress-review`,
  etc.) for structured coaching workflows rather than improvising them here.
