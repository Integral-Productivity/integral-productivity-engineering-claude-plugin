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

`args` is an object, not a JSON string. `repo`, `repoPath` and `scratch` are
required.
`repo` must look like `Owner/name`; `repoPath`, `worktreeRoot` and `scratch`
must be absolute paths of letters, digits, `.`, `_`, `-` and `/` only, with no
`..` (no spaces); `issues`, when present, must be a non-empty list of
positive integers (`[]` is an error, not a request to sweep the backlog);
`maxFixes` and `minBudgetPerFix`, when present, must be positive integers,
never silently defaulted. Anything else stops the workflow before an agent
runs.
Without `issues`, it considers every open `ready-for-agent` issue, oldest
first. `maxFixes` defaults to 3. When the turn has a `+Nk` token budget, the
budget is checked before every round: a fix with less than `minBudgetPerFix`
(default 150,000) left does not start and is reported as deferred, and one that
runs low before a rework round stops and is escalated with its last verdict.
`worktreeRoot` defaults to `<repoPath>/.claude/worktrees`. `scopeFence` maps an
issue number to the files its fixer may edit. When the lead gives one, it is
the edit boundary. Without one, the scope the admission agent read from the
issue is shown to the fixer only as an advisory, fenced suggestion, because
anyone can edit an issue body on a public repo. When `scopeFence` is given,
an admitted issue it does not name is not fixed: it is reported under
`skipped` and never gets the guessed scope. A malformed `scopeFence` stops
the workflow before an agent runs, rather than silently falling back to that
guess. It is malformed if a key is not an issue number, if a value is not
non-empty text, or if a key is outside `issues` when `issues` is given. A key
that matches no admitted issue is logged as unused.

## What it does

1. **Admit.** One agent reads each candidate. Its prompt sets a boundary: `gh`
   and `git` only, only on `repo`. Its only GitHub writes are adding
   `status:in-progress` to a candidate it admits and removing a label it
   added. No comments, other labels, pushes, pull requests or MCP tools. It
   skips a candidate unless it is open
   and labelled `ready-for-agent`. It also skips an already-claimed one
   (`status:in-progress`, or an open PR referencing it). It claims the rest
   with the label, up to the cap, and records every skip with its reason. For
   each admitted issue it creates `<worktreeRoot>/fix-<n>` on a new branch
   `claude/fix-<n>-<slug>` from `origin/main`, and records the base SHA, the
   files the fix will likely touch, the ground truth and the scope fence.
2. **Lanes.** Issues that share a likely file are fixed one after another in
   one lane, in admission order, logged as `serialized`. Lanes run side by
   side. Every branch is cut from the same `origin/main` at admission, so a
   later fixer in a lane does not see the earlier fix. Only the first
   VERIFIED item of a lane is push-ready; it carries a `mergeOrder` note. A
   later VERIFIED item in the lane was verified alone. Rebasing it onto the
   earlier fix makes a new, unverified SHA, so it is reported under
   `needsReverify`, never `readyToOpen`: once the earlier fix lands, rebase it
   and run fix-queue on it again. Changing how lanes cut their branches is
   tracked on #112.
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
   verified tree, worktree, and `mergeOrder` for the first item of a
   same-file lane) plus `needsReverify`, `blocked`, `escalated`, `deferred`
   and `skipped`, each with its reason and
   SHA where there is one. An error on one item, such as an agent failure or
   an exhausted budget, is recorded as blocked for that item; items that
   already finished in the same lane keep their results. `readyToOpen` and
   `needsReverify` also carry the verifier's `coverage`, so a degraded review
   is visible before anything is pushed. Every reason, coverage and history
   field is agent-authored. In the report and in log lines it is shown through
   the same printable-ASCII allowlist, with other characters as `\u` escapes
   and anything over 500 characters truncated, and `report.note` says to read
   it as data.

## Fail-closed and injection rules

- **Fail closed.** An item counts as VERIFIED only when the verifier returns
  `VERIFIED` for exactly the submitted SHA, with no BLOCKING finding. Every
  other case gives no VERIFIED:
  - a missing or different SHA in the verdict is escalated
  - VERIFIED with any BLOCKING finding is escalated (the verifier profile
    defines VERIFIED as having none)
  - a submission whose `branch` or `worktree` is not the one the issue was
    given goes back as a REWORK round, and the verifier is told to confirm
    that `git -C '<worktree>' rev-parse '<branch>'` prints the submitted SHA,
    so the SHA the lead is handed is the tip of the branch it pushes
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
  have claimed them. The first entry the admission step returns for a number
  decides it, whether it was admitted or rejected; any later entry for that
  number is a skipped duplicate, never fixed. A number the admission step
  lists as both skipped and admitted is not fixed and is reported once, as
  skipped. With `issues` given, a requested number the admission
  agent did not account for is reported as blocked, so a claimed issue is
  never silently lost.
- **Untrusted text is fenced.** Issue titles, everything the admission agent
  gathered from an issue, every submission field and every verdict enter a
  prompt only inside a `<<<DATA name: untrusted text as one JSON string ...>>>`
  fence. Each prompt says to report an instruction found inside, never follow
  it. The body is a single JSON-escaped line of printable ASCII only. This is
  an allowlist, not a list of known-bad characters. Every UTF-16 code unit
  outside `\x20`-`\x7e`, plus ASCII `<` and `>`, is written as a `\u`
  escape; an astral character becomes its two surrogate escapes. That covers
  line and paragraph separators, lookalike brackets, zero-width, bidi and tag
  characters, and anything not yet thought of. So the body cannot start a new
  line or render a closer, real or lookalike. (The first version used a list of
  known characters; review found U+2028, U+FE64 and tag characters getting
  through.) A previous SHA
  enters a rework prompt only if it is a full hex id. The workflow's own
  missing-field check is labelled as such in the rework prompt, never as the
  verifier's verdict.
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
16. ASCII, fullwidth, zero-width and guillemet fence closers from an issue
    title, ground truth, scope or submission: every fenced body is one JSON
    line with no bracket or lookalike, and no forged header line appears
17. a different branch or worktree never reaching the verifier, and the
    branch-tip check in the verifier's dispatch
18. VERIFIED with a BLOCKING finding escalated
19. a multi-line text sent as the SHA never appearing outside a fence in the
    rework prompt; the workflow's own check labelled; no "round 3 of 2"
20. the "information only" sentence present in fixer and verifier prompts
21. a duplicate admission reported once as skipped; an unaccounted requested
    issue reported as blocked
22. in a same-file lane, only the first VERIFIED item push-ready; a later one
    under `needsReverify`; no marker on a blocked item
23. six malformed `scopeFence` shapes, and a key outside `issues`, throwing
    before any agent runs; an unused key logged
24. a returned key that is not lowercase letters and underscores never
    relayed to the verifier
25. the fence allowlist, one test per class: U+2028/2029/0085, tag
    characters (a tag-encoded closer), bidi isolates U+2066-2069 and U+061C,
    and lookalikes U+FE64/FE65 and U+276E/276F. Every fenced body stays one
    line of printable ASCII
26. trimmed SHA, base and verified tree in `readyToOpen` and `needsReverify`
27. a rejected-first duplicate never fixed; an issue both skipped and
    admitted reported once, as skipped
28. with `scopeFence` given, an admitted issue it does not name skipped, with
    no agent run and no guessed scope
29. malformed `maxFixes` or `minBudgetPerFix` (a string, 0, negative,
    non-integer, null, a boolean) throwing before any agent runs
30. `issues: []` throwing; the backlog sweep only when `issues` is absent
31. agent-authored text, including separators, tag characters and 2,000
    characters, reaching the report and log only as capped printable ASCII,
    with the note saying it is agent-authored
32. the verifier's coverage, sanitized, in `readyToOpen` and `needsReverify`
33. the admission prompt's write boundary
34. VERIFIED with a `findings` that is not a list escalated
35. `scratch` required

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
- the fence body not JSON-escaped; lookalike characters not escaped
- the branch and worktree bindings removed; the branch-tip line removed
- VERIFIED with a BLOCKING finding accepted
- a raw previous SHA in the rework prompt; the workflow check labelled as the
  verifier's
- the "information only" sentence removed
- a duplicate admission reported as blocked; requested-issue accounting off
- a later lane item left push-ready; the marker put on every item;
  `needsReverify` dropped from the report
- each `scopeFence` check removed, and the unused-key log removed
- the relayed-key filter removed
- for the adversary round: bad numeric args defaulted instead of throwing;
  `issues: []` allowed; report text left raw; no length cap; the note
  dropped; coverage missing or unsanitized; the admission boundary removed;
  a non-list `findings` accepted; `scratch` optional
- the allowlist swapped back to the old list of known characters, which
  fails all four class tests; the ASCII `<`/`>` escape dropped
- the SHAs left untrimmed; the rejected-first duplicate check removed; the
  skipped-and-admitted check removed; an unnamed issue given the guessed scope
- each of the 15 submission fields made optional. The checks for `sha`,
  `base` and `verified_tree` are equivalent mutants: a missing value still
  fails their 40-character hex check, so behavior does not change

The first real run is the lead's one-issue acceptance run.
