# Route inference

Inferring the `handling:route:*` label — the GlassFrog **role accountable** for delivering an
issue. This is the half of the skill that praxis#1202 asks about.

**One route label per issue** (SAE-009). It names the accountable role, not every role that
touches the work. Collaborating and consuming roles go in the issue body.

## Why this needs a second source

`templates/role-labels.json` carries names only — `roleName`, `circleName`, `roleId`, `color`.
It has no purposes and no accountabilities. But that is what inference actually runs on:
praxis#1202's own argument is *"role inference from GlassFrog role purposes and
accountabilities is tractable"*, and ADR-0116's worked example reasons entirely from
accountability text. Name-matching alone would not have routed praxis#1093 — nothing in the
string "Voice of the Customer" resembles "ask two clients the data-ownership question."

So the manifest's `gf:role_*` id is a join key back into GlassFrog.

## Getting the corpus — one call, not 137

Use `glassfrog_list_roles`, **not** `glassfrog_get_role_context`.

`list_roles` returns `purpose`, `accountabilities`, `domains`, `flags`, `parent_role_id`, and
`original_role_id` for every role. `per_page` maxes at 500 and the org has 137 deduped roles,
so the whole corpus arrives in one call. `get_role_context` returns the same role detail
wrapped in the constitution summary, ancestor chain, sibling list, and org skills — roughly
4 KB per role. Reserve it for inspecting a single role you have already shortlisted.

Do **not** use the `q` parameter to shortlist. It is a literal full-text match, not semantic:
`q="customer research"` returns zero results even though Voice of the Customer's first
accountability reads *"Researching customer needs and behaviors."* Pull the corpus and reason
over it.

### Dedupe — do this before you score anything

A role linked into a second circle is one role, not two. Key on `original_role_id ?? id`
(SAE-009). The manifest is already deduped this way; match yours to it.

**Skipping this does not merely double-count — it manufactures decoys.** A linked copy carries
`flags: ["linked"]`, a populated `original_role_id`, the original's `name` and `purpose`, and
**empty `accountabilities` and `domains`**. So it looks like a same-named role with no
evidence against it. Verified live 2026-08-02, two such copies exist:

| Linked copy | `original_role_id` | Evidence on the copy |
|---|---|---|
| `role_bebea203…` Technology Architecture | `role_528e6fa3…` | none — 0 accountabilities, 0 domains |
| `role_26cab755…` Product Architecture | `role_d6b5326d…` | none — 0 accountabilities, 0 domains |

A gate that scores on name similarity would rank these alongside the real roles; a gate that
escalates on plural matches would escalate every issue touching either. Both failure modes are
avoided entirely by deduping first.

If you ever see two **genuinely distinct** roles resolve to one label name, that is a real
collision and SAE-009's rule is to qualify both with the parent circle — but treat it as a
manifest bug to fix upstream, not something to resolve here. As of 2026-08-02 the manifest has
137 entries and zero duplicate names, so there are none.

## What to weigh, in order

Three kinds of evidence, and they are not equal.

1. **Domains — the strongest signal.** A domain is an *exclusive authority claim* over
   something. If the issue changes a thing that a role holds as a domain, that role is
   almost certainly accountable or must consent. ADR-0116's #1093 analysis turns on Product
   Management holding exclusive prioritization authority over the Product Engineering
   Backlog domain.
2. **Accountabilities — the primary matching surface.** Ongoing activities the role owes the
   org. This is where most matches are found. Match against *what the issue asks someone to
   do*, not what subsystem it touches.
3. **Purpose — a tiebreaker, not a match.** Purposes are broad by design ("Bring customer
   awareness to decision making"). A purpose alone is too coarse to route on; use it to
   choose between two roles that both matched on accountabilities.

**Repo location is not evidence.** It is the *anti-signal* this whole mechanism exists to
correct. praxis#1093 read as engineering work purely because it lived in the praxis repo. If
your reasoning contains "it's in this repo, so...", discard it and start over.

**Structural roles are rarely the answer.** `Secretary`, `Facilitator`, `Circle Lead`,
`Circle Rep` (71 of the 137) own meeting and governance mechanics. Route to one only when the
issue is genuinely about those mechanics — not because the work happens inside their circle.

## Worked example — praxis#1093 (the known-answer case)

Issue: *"Ask two active clients the data-ownership question."* Filed in praxis, whose backlog
is the Product Engineering Backlog domain.

| Role | Evidence | Verdict |
|---|---|---|
| **Voice of the Customer** | Accountability: *"Designing, facilitating, executing, and synthesizing research studies to support hypotheses from members of our organization"*; also *"Guiding research necessary to test hypotheses"* | **Accountable** — the issue *is* a research study testing a hypothesis |
| Client Relations | Accountability: *"Engage clients 1:1 and in groups to gather information about their issues, including needs, wants, and concerns"*; also *"Solicit feedback from @Client about company actions and offerings"* | Collaborating — the access path, not the owner |
| Product Management | Domain: exclusive prioritization over the Product Engineering Backlog | Consuming — the answer's customer |
| Product Engineering | Purpose: *"Deliver engineering solutions..."* | Not involved — no engineering solution is required |

Result (applied by a human, and now live on the issue):
`handling:route:voice-of-the-customer`, with the other three named in the body.

### Calibration warning — this case is hard, not easy

Do not read the table above as a clean win. Verified against live GlassFrog 2026-08-02:

- The issue is titled *"Ask two active clients the data-ownership question."* On surface
  match, **Client Relations wins** — its accountabilities cover 1:1 client engagement to
  gather information, and soliciting feedback from clients, almost verbatim.
- Voice of the Customer wins only on a finer reading: the body frames the conversations as
  testing STRATEGY.md's premise — *a hypothesis* — which is what distinguishes a research
  study from issue-gathering.
- Both roles sit in the **same circle** (Customer Success). Neither holds a domain bearing on
  the issue. Both have direct accountability hits.

So the org's one published known-answer case sits close to the escalation boundary. Two
consequences for whoever tunes the gate:

1. **Plural strong matches are the normal case**, not a warning sign. A gate that escalates
   whenever two roles match will escalate nearly everything.
2. **The distinguishing evidence was in the issue body's framing, not the role text.** What
   separated the two roles was *why* the issue asks for the conversations. Any gate that
   compares role text against the issue title alone gets this one wrong.

When you change the gate, re-run this case first. If it no longer reaches Voice of the
Customer — or reaches it without the hypothesis-testing evidence in the comment — the change
regressed.

## The confidence gate

Work the five steps in order. Each one has to produce something you can **quote**, because the
comment you write has to survive a human disagreeing with it.

**1 — Extract the ask.** Name the primary *verb* the issue requires, and its object: decide,
document, build, fix, research, administer. Take it from what the body asks someone **to do**,
not from what the issue is **about**. Every issue in a triage-label thread is *about* triage
labels; the verb is what separates them.

If no verb can be extracted — "improve the triage flow", "look at X" — the issue is
under-specified. That is a spec gap, not an ownership problem: **skip routing** and carry the
finding into the state decision, where it is evidence for the awaiting-information state. Do
not escalate. `needs-triage-decision` means exactly one thing — two or more roles contest a
clear ask — and overloading it destroys that signal.

**The object is as load-bearing as the verb.** praxis#1093 turns on it: Client Relations is
accountable for *"Engage clients 1:1 and in groups to gather information about **their** issues,
including needs, wants, and concerns"* — object, the client's own concerns. #1093 asks clients
about **our** premise. Same verb, different object, wrong role. Name the object precisely or
step 2 will match the wrong accountability.

**2 — Match verb to accountability.** A role matches when one of its accountabilities
describes *that verb on that object*. **Quote it.** If you cannot quote a single accountability
in one line, you did not match — you pattern-matched on topic.

Purpose is never a match. Purposes are broad by design; use one only to choose between two
roles that have already matched on accountabilities.

**3 — Confirm with domains.** A domain over the artifact raises confidence and is worth
quoting. Its **absence never blocks an apply** — praxis#1093 routed cleanly with no bearing
domain among any candidate. A domain alone is also not enough: praxis#1293's only domain-holder
(Tech Ops, holding the GitHub org) was the wrong answer, because its accountabilities are
administrative rather than standard-setting.

**4 — Structural guard.** Drop `structural: true` roles (71 of the 137) from the candidate set
unless the verb is one they actually hold: scheduling meetings, capturing or publishing
governance or tactical output, interpreting the constitution. Their five accountability sets
are near-identical, so a weak match surfaces dozens at once — and "the work happened inside
their circle" must never become a reason to route to a Secretary.

**5 — Decide.**

| Situation | Branch |
|---|---|
| Exactly one role matched the verb | **Apply** |
| Two or more roles matched the *same* verb | **Escalate** |
| The ask carries two verbs owned by different roles | **Escalate** |
| Verb extractable, but no accountability describes it | **Escalate** |
| No verb extractable | **Skip routing** — spec gap, feeds the state decision |
| GlassFrog unreachable | **Degrade** |

When applying to a role with **no filler**, apply anyway and add one line noting the vacancy.
SAE-009 routes to roles, not people — but an issue routed to a role nobody fills should say so
rather than look handled.

### Why the verb, and not the subject

praxis#1291 and praxis#1292 drew the same two candidate roles — Product Management
(*"Triaging issues to determine priority and handling"*) and Product Ops (*"Documenting product
operational workflows, runbooks, and known failure modes..."*). Same subject, same circle, same
pair.

#1292 asks only to **write down** semantics that are already settled → Product Ops, applied.
#1291 asks to **decide** a rule *and* **record** it → two verbs, two roles → escalated.

Subject-matter routing puts both in one bucket and gets one of them wrong. Roles are defined by
what they do, so the match has to be verb-to-verb.

### Regression set — re-run these when you change the gate

Four real cases with published reasoning. Traced against this rubric 2026-08-03.

| Case | Verb → object | Rubric result | Expected |
|---|---|---|---|
| praxis#1093 | *test a hypothesis* → our data-ownership premise | Voice of the Customer — *"...research studies to support hypotheses from members of our organization"*. Client Relations drops on **object** (its accountability is the client's own concerns, not our premise). One match → **apply** | ✅ matches the human-applied label |
| praxis#1292 | *document* → already-settled label semantics | Product Ops — *"Documenting product operational workflows, runbooks..."*. Product Management's verb is *triage/determine*, not *document* → drops. One match → **apply** | ✅ |
| praxis#1291 | *decide* a rule **and** *record* it | Two verbs, two roles (Product Management / Product Ops) → **escalate** | ✅ |
| praxis#1293 | *adjudicate* → two conflicting standards | See below — **boundary case** | ⚠️ diverges |

**#1293 is where the rubric stops being able to help, and that is informative.** Applying the
steps narrows four candidates to one: Commons & Standards Stewardship holds *"Facilitate the
evolution of commons and standards"* and *"Advise the institute on what should become canonical
or stay experimental"*, over the domain *"Commons portfolio"* — a clean verb+object match, and
under this rubric its vacancy no longer disqualifies it. That would make it an **apply**, where
the original triage escalated.

The divergence is not a rubric bug. It turns on whether *"commons and standards"* covers
**internal engineering standards** or only the practitioner-facing commons its parent circle
Institutionalization exists to perpetuate. The org tree does not say — and nothing in it holds a
domain over `devops-excellence` or `software-architecture-excellence`.

So SAE-009 and ADR-0116 have no unambiguous owner. Until that gap is closed in GlassFrog, issues
about org-wide engineering standards will sit exactly here, and **escalating is the right answer
for the right reason**: not "two roles contest it" but "the org tree has a hole." Say that in the
comment rather than picking.

### Considered and rejected

**Cross-circle as an escalation trigger.** Two roles in different circles contesting an ask is
no more ambiguous than two in the same circle — step 5 already escalates on the contest itself,
and adding circle distance would only change *how loudly*, not *whether*.

**A scored threshold.** Not auditable. The escalation comment has to hand a human quoted
evidence to choose between; "0.72" is not something anyone can disagree with usefully.

### Apply branch

When the rubric clears:

1. Look up the manifest entry for the winning role.
2. Create the label if absent, using the manifest's exact `name`, `color`, and `description`
   — the `description` carries the `gf:` key (see [`vocabulary-discovery.md`](./vocabulary-discovery.md)).
3. Apply it. Remove any *other* route label already present — one per issue.
4. Comment with the reasoning: name the accountable role and quote the accountability or
   domain text the decision rests on, then name collaborating and consuming roles.

### Escalate branch

When the rubric does not clear:

1. Apply `needs-triage-decision` (creating it if absent — measured 2026-08-02 it exists only
   in praxis, with zero issues, so assume it is missing).
2. Apply **no** route label.
3. Comment naming each candidate role **with the specific accountability or domain text its
   claim rests on**, so the human is choosing between quoted evidence rather than re-deriving
   it. State plainly what made it ambiguous.

### Degradation branch — GlassFrog unavailable

The MCP server needs an authenticated session. In a cloud or AFK run it may be absent —
exactly where unattended triage matters most.

When `glassfrog_list_roles` fails or the server is not connected:

- **Do not fall back to matching on role names.** The manifest's names are available offline,
  and name-matching would silently replace strong inference with weak inference at the moment
  nobody is watching. That is #1202's "Against" argument realized.
- Skip routing entirely. Apply state and category as normal.
- Say so in the triage comment: routing skipped, GlassFrog unreachable, and the date.
- Do not apply `needs-triage-decision` — nothing was found ambiguous, the check never ran.

The durable fix is to precompute purposes and accountabilities into the manifest upstream so
inference works offline; that is filed as a follow-up against `devops-excellence`, not
implemented here.
