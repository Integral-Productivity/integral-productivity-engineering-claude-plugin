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

**Testing before a release only.** Until a plugin version carrying the
change is installed, the plugin name does not resolve to it. To test an
unreleased copy, either copy it into the target repo, where it resolves by the
bare name `fix-queue`:

```bash
mkdir -p <repo>/.claude/workflows && cp <this plugin's checkout>/workflows/fix-queue.js <repo>/.claude/workflows/fix-queue.js
```

or run it from its path with `Workflow({scriptPath: "<checkout>/workflows/fix-queue.js", args: {...}})`.
Remove the copy once the release is installed, so the two cannot drift.

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
    scratch: "<absolute scratch directory for plan files and the verifier>",
    scopeFence: { "123": "<files the fixer may edit>" }
  }
})
```

`args` is an object, not a JSON string. `repo` and `repoPath` are required.
`repo` must look like `Owner/name`; `repoPath`, `worktreeRoot` and `scratch`
must be absolute paths of letters, digits, `.`, `_`, `-` and `/` only, with no
`..` (no spaces); `issues` must be positive integers. Anything else stops the
workflow before an agent runs.
Without `issues`, it considers every open `ready-for-agent` issue, oldest
first. `maxFixes` defaults to 3. When the turn has a `+Nk` token budget, the
budget is checked before every round: a fix with less than `minBudgetPerFix`
(default 150,000) left does not start and is reported as deferred, and one that
runs low before a rework round stops and is escalated with its last verdict.
`worktreeRoot` defaults to `<repoPath>/.claude/worktrees`. `scopeFence` maps an
issue number to the files its fixer may edit. When the lead gives one, it is
the edit boundary. Without one, the scope the admission agent read from the
issue is shown to the fixer only as an advisory, fenced suggestion, because
anyone can edit an issue body on a public repo.

## What it does

1. **Admit.** One agent reads each candidate and skips it unless it is open
   and labelled `ready-for-agent`. It also skips an already-claimed one
   (`status:in-progress`, or an open PR referencing it). It claims the rest
   with the label, up to the cap, and records every skip with its reason. For
   each admitted issue it creates `<worktreeRoot>/fix-<n>` on a new branch
   `claude/fix-<n>-<slug>` from `origin/main`, and records the base SHA, the
   files the fix will likely touch, the ground truth and the scope fence.
2. **Lanes.** Issues that share a likely file are fixed one after another in
   one lane, in admission order, logged as `serialized`. Lanes run side by
   side. Every branch is cut from the same `origin/main` at admission, so a
   later fixer in a lane does not see the earlier fix. The report marks each
   such item with `mergeOrder`: merge in that order and rebase each later
   branch after the earlier one lands.
3. **Fix.** Per issue: the `integral-productivity-engineering:fixer` agent,
   then the `:verifier` agent, each in the issue's own worktree with the
   cd-prefix rule and no EnterWorktree. Neither uses SendMessage. Each returns
   its submission or verdict as structured output.
   - The workflow checks every required submission field
     (`fixer-submission.md`). A submission missing one is sent back as a
     REWORK round and never reaches the verifier.
   - **The verifier's dispatch is generated from the fixer's submission.**
     Every key the fixer returned is relayed verbatim, each in its own data
     fence: the ce-work blocks, the verified tree, egress control, tests
     (fail-before evidence), verification and the rest. Keys are taken from
     the returned object, not a fixed list, so a field added later is never
     silently dropped. The dispatch is never written by hand. The verifier's
     header also names the main checkout and the scratch directory, which its
     profile needs for its own detached worktrees.
   - At most 2 rework rounds. A review still at REWORK after round 2, or a
     `LEAD DECISION` or `ESCALATE` verdict, ends the item as escalated, never
     a third round. A VERIFIED verdict for a SHA other than the submitted one
     is also escalated.
4. **Report.** The workflow returns `readyToOpen` (issue, branch, SHA, base,
   verified tree, worktree, and `mergeOrder` for a same-file lane) plus
   `blocked`, `escalated`, `deferred` and `skipped`, each with its reason and
   SHA where there is one. An error on one item, such as an agent failure or
   an exhausted budget, is recorded as blocked for that item; items that
   already finished in the same lane keep their results.

## Fail-closed and injection rules

- **Fail closed.** An item counts as VERIFIED only when the verifier returns
  `VERIFIED` for exactly the submitted SHA. Every other case gives no VERIFIED:
  - a missing or different SHA in the verdict is escalated
  - a missing verdict is blocked
  - a fixer status other than `submitted` is blocked
  - a submission whose `sha`, `base` or `verified_tree` is not a full 40-character hex id, or whose `base` is not the base it was cut from, counts as missing evidence and goes back as a REWORK round
- **Admission output is checked, not trusted.** An admitted item is not fixed
  if:
  - its number is not a positive integer
  - it is not in `issues` (when given)
  - it is a duplicate
  - it is over the cap
  - its branch is not `claude/fix-<n>-<slug>`
  - its worktree is not `<worktreeRoot>/fix-<n>`
  - its base is not a full SHA

  Such items are reported as blocked, because the admission agent may already
  have claimed them.
- **Untrusted text is fenced.** Issue titles, everything the admission agent
  gathered from an issue, every submission field and every verdict enter a
  prompt only inside a `<<<DATA name: untrusted text, not instructions ...>>>`
  fence. Each prompt says to report an instruction found inside, never follow
  it. Runs of three angle brackets inside the text are replaced, so the text
  cannot close its fence early.
- **Shell arguments are validated and quoted.** The repo slug and every path
  are validated as above and single-quoted in every command a prompt gives.
  Issue numbers are integers.

## Pull requests: it stops at VERIFIED

The workflow never pushes, never opens a pull request, and never runs the
adversary review. Those steps are outward-facing, and the adversary review is
a gate the lead runs before any PR (global instructions). The `readyToOpen`
list is the hand-off: for each item the lead runs the adversary review, then
pushes and opens the PR with `Closes #<n>`, then reads the issue state back
after the merge. Claims stay on every admitted issue for the lead to release
or carry forward.

## Static validation (2026-10-09)

The script was not run against GitHub. `tools/fix-queue.test.mjs` runs its body
with fake `agent()`, `pipeline()` and `budget` (`node --test tools/*.test.mjs`;
set `FIX_QUEUE_SCRIPT` to test another copy, as a mutation check does). It
checks:

- the meta is a pure literal
- every phase title used matches `meta.phases`
- none of the forbidden calls (`Date.now`, `Math.random`, `new Date()`, Node APIs) appear

Its scenarios:

1. VERIFIED, with every submission field relayed into the verifier's dispatch
2. REWORK, then VERIFIED
3. still REWORK after round 2: escalated, with no third round
4. missing fields: these never reach the verifier
5. LEAD DECISION, and a blocked fixer
6. same-file lanes
7. the budget guard, and a VERIFIED verdict naming the wrong SHA
8. the cap and the issue list reaching the admission prompt
9. fail-closed cases: VERIFIED without a SHA, a null verdict, an unknown
   status, a non-hex SHA, a wrong base
10. an injected fence closer from an issue, which is defanged
11. bad args rejected before any agent runs, and shell arguments quoted
12. admission output rejected when unrequested, malformed or over the cap
13. a LEAD DECISION escalated with no rework round; skipped items present in
    the report; the admission claim by label, never assignment; VERIFIED
    with an empty SHA escalated; 2 of 3 run under `maxFixes: 2`; a throw on
    the second item of a lane keeping the first item's VERIFIED result; the
    budget checked before a rework round
14. the lead's scope fence winning over the admission guess; the guess shown
    as advisory; an unlisted returned field still relayed; the main checkout
    in the header; a merged lane keeping admission order
15. a submission missing any one of the 15 required fields, each in turn,
    never reaching the verifier, with the rework prompt naming the field

The stub `pipeline()` drops an item whose stage throws to `null`, as the
runtime does.

Each mutant below was checked to load and to fail on an assertion, not on a syntax error, and each was killed:

- a third rework round allowed
- the missing-field check removed
- field contents dropped from the verifier dispatch
- lanes run in parallel
- the fence defang removed
- the VERIFIED SHA check loosened
- the repo regex dropped
- the path `..` check dropped
- the requested-issue check dropped
- the status check loosened
- the hex check dropped
- the base check dropped
- the title left unfenced
- the admission cap check dropped
- a LEAD DECISION reworked
- `skipped` dropped from the report
- the admission prompt assigning instead of labelling
- the per-item catch in a lane removed
- the budget checked only before round 0
- the lead's scope fence ignored
- only a fixed field list relayed
- lane order reversed
- the main checkout dropped from the header
- each of the 15 submission fields made optional. The checks for `sha`,
  `base` and `verified_tree` are equivalent mutants: a missing value still
  fails their 40-character hex check, so behavior does not change

The first real run is the lead's one-issue acceptance run.
