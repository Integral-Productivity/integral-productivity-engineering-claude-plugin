# The fix-queue workflow

`workflows/fix-queue.js` at this plugin's root is a saved Claude Code Workflow
that runs the lead/fixer/verifier pattern from this plugin's ADR 0002 as fixed
steps, so none of them depends on the lead remembering it (issue #90).

## Where it lives (finding, 2026-10-09)

Plugins can ship named workflows. From
<https://code.claude.com/docs/en/workflows.md>, "Distribute a workflow in a
plugin": "Place the script in a `workflows/` directory at the plugin root, or
point to a different location with the `workflows` manifest field. Plugin
workflows are namespaced by the plugin name. A plugin called `acme-tools`
containing a script whose `meta.name` is `release-audit` runs as
`/acme-tools:release-audit`."

So this one runs as `integral-productivity-engineering:fix-queue` with nothing
to install beyond the plugin itself. The same page puts project workflows in
`.claude/workflows/` and personal ones in `~/.claude/workflows/`, both `.js`.
It does not say whether the file name must match `meta.name`, so they match
here (`fix-queue.js`, `meta.name: 'fix-queue'`). After the plugin updates, run
`/reload-skills` (or start a new session) so the new version is read.

## Running it

From a session whose working directory is the target repo, with this plugin
installed:

```text
Workflow({
  name: "integral-productivity-engineering:fix-queue",
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
