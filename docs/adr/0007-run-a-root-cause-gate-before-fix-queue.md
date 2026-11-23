# 7. Run a root-cause gate before fix-queue

Date: 2026-11-23

## Status

Proposed

Provenance: GitHub issue #208. Decisions 1 and 7 were chosen by the owner on 2026-11-23.

## Context

fix-queue (ADR 0002, issue #90) starts at admission. Its admission agent reads
the issue text and guesses the files a fix touches, and the fixer works inside
that guess. The issue text names a symptom and a few sentences, not a defect
class.

In a sibling plugin's bug bash (2026-11-20 to 2026-11-22), a fix closed the two
sentences two issues named while the same defect stayed in about nine other
files. Recovery took a revert, a retriage, two REWORK rounds and a maintainer
scope review. That bug bash then restated a root-cause gate and a rule for
leftover gaps by hand in its routine prompt. On 2026-11-22 the owner decided to
move both into this plugin (issue #208), so every repo's bug bash gets them.

Four questions were open: the form of the gate, its name and trigger, where the
rule for leftover gaps lives, and how the gate relates to issue #134
(clustering the backlog by defect class).

## Decision

1. **Form.** The gate is a saved Workflow, `workflows/root-cause-gate.js`, run
   as `integral-productivity-engineering:root-cause-gate`, plus a short guide
   skill, `skills/root-cause-gate-guide/SKILL.md`, for trigger, cost and
   output. A Workflow enforces each step, fans the lens reviewers out in
   parallel, and runs in the same stub test harness as fix-queue. The guide
   takes a distinct name because plugin workflows already appear in the skill
   namespace, so a skill of the same name could shadow the workflow or be
   shadowed by it. Chosen by the owner over a skill only.
2. **Name and trigger.** `root-cause-gate`. A lead runs it before fix-queue,
   per issue or per group. It never runs automatically, and it edits nothing in
   the target repo: it writes plan files to scratch and returns fix-queue args.
3. **The fence is built in code.** Lens reviewers name each issue's defect
   class. One inventory agent lists every site of each class. An issue's scope
   fence is every file of its class's sites plus the test file the plan names,
   computed in the workflow, not written by an agent. Issues in one class share
   one fence and one plan file. The fence cannot shrink back to the issue text.
4. **Lens selection.** All seven lenses (requirements, architecture, design,
   quality, business, engineering, process) when the issue touches a contract,
   an ADR, a hook or unattended use; requirements, design and quality
   otherwise. A lead may force seven.
5. **Failing test.** The gate names the test tier, test file and failing test
   in the plan; the fixer writes it first, through ce-work. Tiers and matrices
   come from the target repo's `CLAUDE.md` or `docs/agents/`, never from this
   plugin.
6. **Residual rule.** One file,
   `skills/writing-dispatch-prompts/reference/residual-rule.md`, sorts every
   leftover gap into fix now, ask the maintainer, or file. It lives there
   because the fixer and verifier already resolve plugin references from that
   directory. The gate, the fixer, the verifier and the lead cite it; none
   restates it.
7. **Relation to #134.** Separate. The gate works per issue or group, before a
   fix; #134 works across the backlog. #134 may consume the gate's defect
   class. Chosen by the owner over folding #134 into #208 or deciding later.

## Consequences

- A gated fix's scope is the defect class, so a bug bash closes the class
  instead of re-filing it.
- Cost per issue: 1 reproduce agent, plus 3 or 7 lens reviewers when it
  reproduces. Per run: 1 inventory and 1 plan agent. The guide states this.
- An issue that no longer reproduces is reported with re-baselined acceptance
  criteria and is not fixed.
- fix-queue does not yet read the plan files; a `plans` argument is a separate
  issue. Until then the lead passes the plan path to the fixer.
- CI gains a job that runs every `tools/*.test.mjs` suite, so the gate's
  scenarios, the residual-rule checks and the existing tool suites all gate
  merges.
