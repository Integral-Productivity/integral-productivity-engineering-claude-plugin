---
name: bootstrap-sync-connector
description: >
  Design and scaffold a service that synchronizes work items between a system of
  record and one or more third-party systems — the shape behind reclaim-integrations
  and any future HubSpot, Circle, or Linear sync. Use this skill whenever someone
  is: building a two-way sync or integration service, adding a connector to an
  existing sync engine, wiring webhooks from a SaaS product into an internal
  system, or asking "should this be one repo or one per integration". Captures the
  three failure modes that are expensive to retrofit — write loops, record-level
  conflict resolution, and event-driven-only designs with no reconciliation — plus
  the vendor-capability audit that must happen BEFORE the architecture is chosen.
  IMPORTANT: invoke this skill BEFORE writing the first connector, and run the
  capability audit before committing to a design — vendor webhook support is the
  single assumption most likely to be wrong.
status: draft
version: 0.1.0
---

# Bootstrap a sync connector service

> **Status:** Draft, written from the reclaim-integrations design session
> (2026-08-03 to 2026-08-05). Promote to `tested` after the second sync service
> uses it without significant correction.

Sync services fail in a small number of predictable ways, and every one of them
is cheap to prevent at design time and expensive to retrofit. This skill is the
order of operations that avoids them.

## When to use

- Building a service that keeps work items in step across two or more systems
- Adding a connector to an existing sync engine
- Wiring SaaS webhooks into an internal system of record
- Deciding between one repository per integration and one engine with plugins

## Step 1 — Audit vendor capabilities BEFORE choosing an architecture

This step is first because skipping it is the most common way to design the
wrong system. Do not accept "it has webhooks" from memory or experience,
including your own. Check the current documentation for every system, and
record the date you checked.

In the reclaim-integrations session, the operator stated from direct experience
that all three third-party systems had webhooks. One had none at all. That
finding changed the architecture from "webhooks with a reconciliation backstop"
to "connectors declare capability tiers" — a structural difference, discovered
only because the assumption was checked rather than trusted.

For each system, answer:

| Question | Why it changes the design |
|---|---|
| Webhooks at all? On which plan? | No webhooks means poll-only, which forces a capability abstraction rather than a special case |
| Full entity in the payload, or an id and a link? | Thin payloads make a follow-up fetch mandatory rather than optional |
| Signature scheme? HMAC, static header, none? | Weaker schemes need a compensating design, not just a note in the README |
| Retries? Ordering guarantee? Redelivery API? | No retries means a repair path is mandatory |
| Delta query — timestamp, cursor, ETag, or nothing? | Decides reconciliation cost and detection latency |
| Rate limit, and in what unit? | Budgets can differ by four orders of magnitude across vendors in one system |

That last row is not hypothetical. In one design, Productboard allowed 50
requests per **second** while GlassFrog allowed 50 per **hour**. A single shared
sweep cadence would have been wrong for both.

Two traps in the audit itself:

- **A parameter documented in prose is not a parameter that works.** If a spec
  describes a filter in its narrative but does not declare it on individual
  endpoints, test it. Probe with a timestamp in the **future**: a filter that is
  ignored returns every row, and one that works returns none. Comparing two past
  timestamps cannot distinguish those cases.
- **Check the target system too, not only the sources.** A system of record that
  publishes no webhooks for the objects you care about turns your reconciliation
  sweep from a safety net into the only mechanism you have.

## Step 2 — Choose the repository shape

Default to **one repository, connectors as packages, one deployment**. The
package boundary gives isolation; the deployment boundary costs money and
operator attention.

| | Repo per connector | Monorepo, packages, one deploy | Single package with conditionals |
|---|---|---|---|
| Cost of connector N+1 | Full service bootstrap | Lifecycle map plus a predicate | Edit shared branches, risk existing connectors |
| Operational surface | N pipelines, N secret stores | One of each | One of each |
| Failure isolation | Strong | Compile-time only | None |
| When it's right | Genuinely different scaling profiles or teams | Almost always | Never past connector 2 |

A package can be promoted to its own deployment later with no code change. That
reversibility is why the cheap option is also the safe one.

## Step 3 — Model the domain once, not per pair

Define one canonical work item and map every system to it. N sources mapping to
one model is N maps; N sources mapping pairwise to a target is N maps that
double when a second target appears.

Keep the canonical model **small**. The temptation is to make it a superset of
every source's fields; resist it. Fields that do not change what the system
actually does — schedule, route, notify — do not belong. Carry the remainder in
an opaque bag the core stores and returns but never interprets.

Give each connector two pure functions:

- a **lifecycle map** from native states to canonical status
- a **trigger predicate** deciding which source items deserve to exist at all

Both are table-driven and reviewable by reading the table. An unmapped native
state must **throw**, never silently default — a silent default is a bug that
looks like working software.

## Step 4 — Declare capabilities; never branch on connector identity

The core must not contain the string `"github"` anywhere. Connectors declare
what they can do; the engine reads the declaration and picks a strategy.

```ts
type Capabilities = {
  webhooks:       boolean
  verification?:  'hmac-sha256' | 'static-header'   // required iff webhooks
  writeBack:      boolean
  delta:          'timestamp' | 'cursor' | 'etag' | 'full-scan'
  deltaFallback?: 'timestamp' | 'cursor' | 'etag' | 'full-scan'
  rateBudget:     { requests: number; perSeconds: number }
  sweepCadence:   Seconds
}
```

Name the "no delta filter" case `full-scan`, not `none`. A full scan is a
strategy, not the absence of one, and naming it accurately stops people
treating it as a gap to be worked around.

This is the rule that keeps connector count off the core complexity curve, and
it is mechanically checkable — see Step 8.

## Step 5 — Treat every webhook as a hint

Never build state from payload contents. On receipt: verify, persist the raw
delivery, acknowledge 2xx immediately, enqueue. The worker then **re-fetches the
authoritative record** and computes a full desired state from that snapshot.

This single decision makes out-of-order, duplicated, and replayed deliveries all
converge, because the result depends on observed source state rather than on
event ordering. Applying payload contents directly means encoding action
semantics and replaying them in an order no vendor guarantees.

The cost is one extra GET per change. Where the vendor supports conditional
requests, that GET is often free — GitHub does not count a 304 against the
primary rate limit when the request is correctly authorized.

Resist the hybrid. When one vendor sends full payloads and another sends an id,
it is tempting to apply the rich one directly and re-fetch only the thin one.
That buys one saved request and costs two code paths, two sets of failure modes,
and two sets of tests.

## Step 6 — Own fields, not records

Record-level last-write-wins silently destroys data. Declare a source of truth
**per field**, in three categories:

- **Source-owned** — identity and intent: title, status, url, due, labels, owner.
  The third-party system wins; the local value is overwritten.
- **Target-owned** — execution: scheduling, at-risk state, logged time. Never
  written back.
- **Source-seeded, target-owned thereafter** — estimate, priority. The connector
  may supply an opening value at link creation; the target owns every change
  after that, so later source hints are ignored rather than reverted.

That third category is the one people miss. Without it, a label that maps to
"priority 1" will fight the human who set priority 3, on every sweep, forever.

Most conflicts then cease to exist rather than being resolved, because the two
sides rarely write the same field. Log every revert with the rule that decided
it — the first time a value silently changes back, the log is the difference
between a five-minute answer and an afternoon.

## Step 7 — Build reconciliation in the first release

Not later. Two reasons, and the second is the one that surprises people.

The obvious reason: webhooks are lossy. Deliveries fail, services go down,
vendors do not always retry.

The one that decides the schedule: **some directions have no push channel at
all.** If the system of record publishes no webhooks for the objects you sync,
reconciliation is not a backstop for that direction — it is the only mechanism.
A design that defers it cannot ship half its functionality.

Retrofitting is expensive because the sweep needs cursors, watermarks, and
content hashes that have to be present from the first write, not added to a
table full of rows that lack them.

Non-negotiable properties:

- **Converges.** From any drift, a bounded number of runs reaches zero writes.
- **Caps writes per run**, and **logs what it deferred**. Silent truncation reads
  as "everything is fine" when it is not.
- **Attributes every repair.** Repairs caused by missed deliveries are how you
  measure webhook reliability instead of guessing at it.
- **Advances its cursor**, so the next run continues rather than restarts.

## Step 8 — Encode the invariants as fitness functions

These four catch the regressions that a code review will not, because each of
them is introduced by a change that looks like an improvement.

1. **Dependency rules.** Connectors may not import the target SDK or each other;
   the core may not import a connector; nothing outside the shared HTTP module
   may import an HTTP library, or the rate limiter is bypassed silently.
2. **A shared connector contract suite**, discovered from the filesystem rather
   than a hand-maintained list, so a new connector cannot skip it.
3. **Idempotency.** Replay, concurrency, stale payloads, out-of-order arrival,
   and full-log replay as a no-op.
4. **No loops.** Apply then sweep produces zero writes, in both directions.

## The three traps, stated plainly

**Write loops.** Store two content hashes per link, one per direction. A
computed desired state matching the inbound hash is a *no-op diff*; source state
matching the outbound hash is *your own write reflected back*. These are
different conditions with different causes, and merging them into one field
looks like a simplification. Write the test that fails when someone does it.

**Silent divergence.** A sync that drifts without saying so is worse than no
sync, because it teaches the user to check the source systems by hand — which
removes the entire benefit. Bound divergence by the sweep interval and make that
interval visible.

**Latency you cannot explain.** When a connector's detection latency is set by a
vendor rate limit rather than by choice, compute it — roughly
`ceil(tracked_items / hourly_budget)` where no delta filter exists — and state it
in the user-facing README. A limitation that is documented is a trade-off; the
same limitation discovered in use is a bug report.

## Composes with

- `bootstrap-private-sdk` — extract the target system's client before building
  the engine. If that API is undocumented, read that skill's section on
  undocumented upstreams.
- `bootstrap-mcp-server` — when the same SDK also backs an MCP server, the SDK
  is the shared layer and both consume it.
- `software-architecture:decide` — one ADR per structural choice above.
- `engineering-architecture-fitness` — for the Step 8 checks.

## When to promote this skill (`draft` → `tested`)

After a second sync service — not reclaim-integrations — is scaffolded with it
and the capability audit in Step 1 catches at least one wrong assumption. That
second catch is the evidence the audit earns its place at the front.
