# The fix-queue workflow

`workflows/fix-queue.js` in this skill is a saved Claude Code Workflow that runs
the lead/fixer/verifier pattern from this plugin's ADR 0002 as fixed steps, so
none of them depends on the lead remembering it (issue #90).

## Where it has to live (finding, 2026-10-09)

The Workflow tool resolves `Workflow({name: ...})` from built-in workflows and
from `.claude/workflows/`. Its own schema describes `name` as "Name of a
predefined workflow (built-in or from .claude/workflows/)". Nothing in the tool
or the plugin docs says a plugin can ship a named workflow, so this plugin
treats that as unsupported. The canonical script lives here, and a repo that
wants it installs a copy:

```bash
mkdir -p <repo>/.claude/workflows && cp "<this skill's base directory>/workflows/fix-queue.js" <repo>/.claude/workflows/fix-queue.js
```

Copy rather than symlink: the plugin's install path changes with every
version, so a symlink into the plugin cache breaks on the next update. Copying
the newer file again picks up changes. A user-level `~/.claude/workflows/` is
likely resolved the same way; that has not been confirmed.

## Running it

From a session whose working directory is the target repo:

```text
Workflow({
  name: "fix-queue",
  args: {
    repo: "Integral-Productivity/<repo>",
    repoPath: "/absolute/path/to/<repo>",
    issues: [123],
    maxFixes: 1,
    verification: "<the repo's verification commands>",
    trailers: "<commit trailers>",
    scratch: "<absolute scratch directory for plan files>"
  }
})
```

`args` is an object, not a JSON string. `repo` and `repoPath` are required.
Without `issues`, it considers every open `ready-for-agent` issue, oldest
first. `maxFixes` defaults to 3. When the turn has a `+Nk` token budget, a fix
does not start with less than `minBudgetPerFix` (default 150,000) left and is
reported as deferred. `worktreeRoot` defaults to `<repoPath>/.claude/worktrees`.

## What it does

1. **Admit.** One agent reads each candidate and skips it unless it is open
   and labelled `ready-for-agent`. It also skips an already-claimed one
   (`status:in-progress`, or an open PR referencing it). It claims the rest
   with the label, up to the cap, and records every skip with its reason. For
   each admitted issue it creates `<worktreeRoot>/fix-<n>` on a new branch
   `claude/fix-<n>-<slug>` from `origin/main`, and records the base SHA, the
   files the fix will likely touch, the ground truth and the scope fence.
2. **Lanes.** Issues that share a likely file are fixed one after another in
   one lane, logged as `serialized`. Lanes run side by side.
3. **Fix.** Per issue: the `integral-productivity-engineering:fixer` agent,
   then the `:verifier` agent, each in the issue's own worktree with the
   cd-prefix rule and no EnterWorktree. Neither uses SendMessage. Each returns
   its submission or verdict as structured output.
   - The workflow checks every required submission field
     (`fixer-submission.md`). A submission missing one is sent back as a
     REWORK round and never reaches the verifier.
   - **The verifier's dispatch is generated from the fixer's submission.**
     Every field the fixer returned is relayed verbatim: the ce-work blocks,
     the verified tree, egress control, tests (fail-before evidence),
     verification and the rest. It is never written by hand.
   - At most 2 rework rounds. A review still at REWORK after round 2, or a
     `LEAD DECISION` or `ESCALATE` verdict, ends the item as escalated, never
     a third round. A VERIFIED verdict for a SHA other than the submitted one
     is also escalated.
4. **Report.** The workflow returns `readyToOpen` (issue, branch, SHA, base,
   verified tree, worktree) plus `blocked`, `escalated`, `deferred` and
   `skipped`, each with its reason and SHA where there is one.

## Pull requests: it stops at VERIFIED

The workflow never pushes, never opens a pull request, and never runs the
adversary review. Those steps are outward-facing, and the adversary review is
a gate the lead runs before any PR (global instructions). The `readyToOpen`
list is the hand-off: for each item the lead runs the adversary review, then
pushes and opens the PR with `Closes #<n>`, then reads the issue state back
after the merge. Claims stay on every admitted issue for the lead to release
or carry forward.

## Static validation (2026-10-09)

The script was not run against GitHub. A stub harness ran its body with fake
`agent()`, `pipeline()` and `budget`, and checked:

- the meta is a pure literal, and every phase title used matches `meta.phases`
- none of the forbidden calls (`Date.now`, `Math.random`, `new Date()`, Node APIs) appear
- these runs behave as described above:
  - VERIFIED at once
  - REWORK, then VERIFIED, with the verdict and the prior submission relayed
  - REWORK three times, escalated with no third rework round
  - missing fields, which never reach the verifier
  - LEAD DECISION, escalated
  - a blocked fixer
  - lanes, where #9 waits for #7 on a shared file while #8 runs alongside
  - the budget guard deferring a fix
  - a SHA mismatch, escalated
  - the cap and the issue list reaching the admission prompt
  - missing `args`, which throws

Four mutants were each killed:

- a third rework round allowed
- the missing-field check removed
- the verifier dispatch dropping field contents
- lanes run in parallel

The first real run is the lead's one-issue acceptance run.
