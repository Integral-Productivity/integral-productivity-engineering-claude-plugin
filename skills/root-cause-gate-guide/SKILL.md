---
name: root-cause-gate-guide
description: >
  Use before running fix-queue on a bug bash, a batch of bugs, or one bug whose
  fix might be narrower than its defect: when a lead asks to find the root
  cause first, to scope a fix to the whole defect class, to check whether an
  old issue still reproduces, or to produce a scope fence for fix-queue. Also
  use after a fix closed only the sentences an issue named while the same
  defect stayed in other files. Explains when to run the
  integral-productivity-engineering:root-cause-gate workflow, what it costs,
  and how to pass its output to fix-queue.
status: draft
version: 0.1.0
---

# Root-cause gate

The root-cause gate is a saved Workflow,
`integral-productivity-engineering:root-cause-gate`
(`workflows/root-cause-gate.js`). A lead runs it before fix-queue. It never
runs on its own. It edits nothing in the target repo.

It answers one question per issue: what is the whole defect class, and what
test proves it is fixed? fix-queue's admission agent guesses a fix's files from
the issue text. The gate replaces that guess with an inventory (ADR 0007).

## When to run it

- Before fix-queue on a bug bash or a batch of `ready-for-agent` bugs.
- Before fix-queue on one bug whose text names a symptom, not a cause.
- When an issue is old and may no longer reproduce.

Skip it for a typo, a one-line config change, or an issue that already names
its defect class, its sites and its failing test.

## What it does

1. **Reproduce.** One agent per issue reproduces it on current main. An issue
   that no longer reproduces goes to `notReproduced` with re-baselined
   acceptance criteria. It gets no lens reviewers and no scope fence.
2. **Review.** Independent lens reviewers name root causes and a defect class
   with file:line evidence. Each reviewer gets only the issue numbers, the repo
   path and its own lens.
3. **Inventory.** One agent merges the reviewers' classes and lists every site
   of each class, every claim that cites the issues, and any matrix the repo
   declares.
4. **Plan.** One agent writes one plan file per defect class under
   `<scratch>/root-cause-gate/`. Each plan names the test tier, the test file
   and the failing test to write first.
5. **Fence.** Code, not an agent, builds each issue's scope fence: every file
   of its class's sites, plus the test file. Issues in one class share one
   fence and one plan file.

Test tiers and matrices come from the target repo (its `CLAUDE.md`, then
`docs/agents/`), never from this plugin.

## Lens selection rule

- **Seven lenses** when the reproduce agent reports that the issue touches a
  contract, an ADR, a hook, or unattended use: requirements, architecture,
  design, quality, business, engineering and process.
- **Three lenses** otherwise: requirements, design and quality.
- Pass `lenses: 'all'` to force seven for every issue.

## Cost

Subagents per issue: 1 reproduce agent, plus 3 or 7 lens reviewers when the
issue reproduces. That is 1 for an issue that does not reproduce, 4 for a
plain issue, and 8 for an issue that touches a contract, an ADR, a hook or
unattended use.

Subagents per run: 1 inventory agent and 1 plan agent, whatever the number of
issues. A run where no issue reproduces stops after the reproduce agents.

Example: 5 issues, 1 gone, 3 plain, 1 touching a hook: 5 + 3×3 + 7 + 2 = 23
subagents.

## Running it

```js
Workflow({ name: 'integral-productivity-engineering:root-cause-gate', args: {
  repo: 'Owner/name',
  repoPath: '/abs/path/to/main/checkout',
  scratch: '/abs/scratch/dir',
  issues: [123, 124],
  // lenses: 'all',
} })
```

The report holds `reproduced`, `notReproduced`, `unclassified`, `failed`,
`scopeFence`, `planFiles` and `fixQueueArgs`.

## Passing the result to fix-queue

`fixQueueArgs` holds `repo`, `repoPath`, `issues` and `scopeFence`. Add
`scratch` and any other fix-queue args, and run fix-queue with them. Its
`scopeFence` wins over the admission agent's guess. When `fixQueueArgs.issues` is
empty, no issue reproduced and was classified: do not run fix-queue, because
it rejects an empty `issues` list. See
[`fix-queue-workflow.md`](../writing-dispatch-prompts/reference/fix-queue-workflow.md).

fix-queue does not read plan files yet. Until it does, quote each issue's plan
file path from `planFiles` to the lead, who can pass it to the fixer.

Before running fix-queue, act on the rest of the report:

- `notReproduced`: update or close each issue with its re-baselined criteria.
- `unclassified` and `failed`: rerun the gate for them, or triage by hand.

## Residuals

Gaps the gate, the fixer and the verifier find outside the defect class are
sorted by
[`residual-rule.md`](../writing-dispatch-prompts/reference/residual-rule.md):
fix now, ask the maintainer, or file an issue.
