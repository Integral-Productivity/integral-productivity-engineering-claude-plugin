# Strategy brief: Automating the compounding loop

> Portable input for a `/ce-strategy` (or `/ce-ideate`) session. Written 2026-07-19 from a praxis
> session where the closing routine (`/ce-compound` + retro) had to be user-invoked *after* PR #940
> merged — the trigger that motivated this brief.

## The problem this addresses

The compounding + retro loop (capture durable learnings → reflect) currently fires **only on manual
user invocation** at session close. That misses two common cases:

1. **The session ends before the PR merges.** The learnings worth compounding are about the *landed*
   work, but by the time it lands (auto-merge on green CI, often minutes-to-hours later) the session
   is gone. Nobody re-invokes `/ce-compound` against the merged result. (This is exactly what
   happened with praxis PR #940.)
2. **The session loses focus / is archived** without the user remembering to run the routine.

Net: compounding depends on the human remembering, at the moment they're least likely to (context
switch, work already "done").

## The reframe (leading option)

Do **not** build a new dedicated "reflective session management" plugin. Instead, automate **only the
compound-trigger** and place each mechanism in the home that already owns its layer. Automate the
objective, automatable half (compound the *landed* technical work); leave the subjective half (the
collaboration retro) human-in-loop or to the kaizen practice.

### Three homes, each already owning its layer

| Trigger class | Mechanism | Home | Why here |
|---|---|---|---|
| **In-session / deferred** — "substantive engineering work landed, not yet compounded" | `Stop` / `PreCompact` / `SessionStart` hooks + a salience gate that nudges or fires headless `ce-compound` | **`integral-productivity-engineering-claude-plugin`** | The engineering plugin already owns the engineering workflow surface (cold-start router, work-type scaffolds). Plugins can ship hooks. Installed only in engineering repos → automatic blast-radius scoping. |
| **Async merge** — "the PR merged after the session ended" | `pull_request: merged` → headless `ce-compound` on the merged SHA | **`devops-excellence` reusable workflow** (consumed per-repo) | This is CI/event infrastructure, not a plugin concern — a plugin can't host a GitHub Action. praxis already consumes devops-excellence reusable workflows. This is the root fix for problem #1. |
| **Retro** — collaboration-quality reflection | (left manual / kaizen-practice automation) | **kaizen practice** (skills monorepo) | Subjective judgment; complementary to compounding but not the same seam. Defer. |

### Why this beats a dedicated plugin

- **Respects existing domain boundaries** (ADR-0004 / SAE-006 lean against plugin proliferation:
  extend an existing home rather than invent a new straddling one).
- **Better blast radius** than global `settings.json` hooks (which fire in every session everywhere)
  *and* than a separate plugin (another install to manage).
- **Forces the useful narrowing**: automate the compoundable half, defer the subjective half.

## The seam to resolve in `/ce-strategy`

"Engineering plugin handles ce-compound triggers" is right for the **hook-based** triggers but not the
**merge-driven** one. The strategy session should decide the split explicitly:
**engineering plugin = in-session hooks; devops-excellence = the async merge trigger; kaizen = the retro.**

## Open design questions to carry in

1. **Salience gate**: what counts as "substantive work landed, worth compounding"? (PRs merged? new
   skill/feature? non-trivial diff? Avoid nagging on one-liners — praxis CLAUDE.md already says the CE
   chain is "chain by default, not chain or nothing.")
2. **Headless `ce-compound` on merge**: does it run against the merged SHA in CI, open its own
   `docs/solutions/` PR, and self-triage? Cross-plugin dependency: the engineering plugin / CI would
   depend on `EveryInc/compound-engineering-plugin` (where `ce-compound` lives).
3. **Dedup**: if both the in-session hook *and* the merge workflow fire, don't compound twice —
   a marker protocol (session records "compounded @ SHA") the merge job checks.
4. **Retro automation**: in scope now, or explicitly deferred to the kaizen practice?

## Two reframes from the originating ideation (context)

This brief itself is the second of two scope-narrowing reframes that emerged in the praxis session:
- Reframe 1: not a full reflective-session-management system → just automate the compound trigger.
- Reframe 2 (this brief): not a new plugin → split across three existing homes.
