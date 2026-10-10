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
it applies before admission: the admission agent is given only the issues it
names (those in `issues`, in that order, or, without `issues`, the fenced
issues in ascending order instead of the backlog sweep). An issue in `issues`
that the fence does not name is never claimed, branched or counted against
`maxFixes`; it is reported once under `skipped`. If no issue is left, no
admission agent runs, and the log says so. An issue the admission agent
returns anyway is not fixed and never gets the guessed scope, and it is still
reported exactly once: returned as admitted, under `blocked`, because it may
carry the claim label; listed under the agent's own skipped, with the
agent's reason. A malformed `scopeFence` stops
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
   `needsReverify`, never `readyToOpen`. Once the earlier fix lands, rebase
   it and re-verify it with `mode: "reverify"` (see "Re-verifying a rebased
   item" below). Running fix-queue on it again in the default mode does not
   work: admission skips the still-claimed issue, and without the claim it
   would cut a fresh branch and dispatch a new fixer (issue #113). Changing
   how lanes cut their branches is tracked on #112.
3. **Fix.** Per issue: the `integral-productivity-engineering:fixer` agent,
   then the `:verifier` agent, each in the issue's own worktree with the
   cd-prefix rule and no EnterWorktree. Neither uses SendMessage. Each returns
   its submission or verdict as structured output.
   - The workflow checks every required submission field
     (`fixer-submission.md`). A submission missing one never reaches the
     verifier. The first time this happens for an issue, the fixer is sent
     back in the same round as a **field-only retry**, labelled as the
     workflow's own check, and no rework round is used: a bad field is not a
     review of the code. Each issue gets one field-only retry. A second field
     failure is sent back as a REWORK round and uses it, so a fixer that keeps
     returning bad fields cannot loop (issue #116).
   - **The workflow runs the adversarial lens itself.** Each submission that
     passes the field check goes first to a separate, read-only reviewer agent
     over exactly `git diff <base> <sha>` in the issue's worktree, then to the
     verifier. The pass never runs on a submission the field check stopped.
     See "How deep the verifier's review is inside fix-queue" below.
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
   same-file lane) plus `needsReverify` (with the SHA, base and verified
   tree a re-verify run takes as its previous ones, the fixer's
   `submission_text`, and `scope_fence` when the lead set one, which it takes
   as `submission` and `scopeFence`), `blocked`, `escalated`,
   `deferred` and `skipped`, each with its reason and
   SHA where there is one. An error on one item, such as an agent failure or
   an exhausted budget, is recorded as blocked for that item; items that
   already finished in the same lane keep their results. `readyToOpen` and
   `needsReverify` also carry the verifier's `coverage` and the workflow's
   own `adversarial_review` record (`ran: <b> BLOCKING, <s> SHOULD-FIX, <n> NOTE`,
   or `not run: <reason>`), so a
   degraded review is visible before anything is pushed. A field-only retry
   shows in `history` with `fieldRetry: true`. Every reason, coverage and history
   field is agent-authored. In the report and in log lines it is shown through
   the same printable-ASCII allowlist, with other characters as `\u` escapes
   and anything over 500 characters truncated, and `report.note` says to read
   it as data.

## Re-verifying a rebased item

A `needsReverify` item was VERIFIED alone, on the base its whole lane was cut
from. After the earlier fix in its lane lands, the lead rebases its branch
onto `origin/main` in its worktree, records the new SHA and its tree, and
runs:

```text
Workflow({
  name: "integral-productivity-engineering:fix-queue",
  args: {
    repo: "Integral-Productivity/<repo>",
    repoPath: "/absolute/path/to/<repo>",
    scratch: "<absolute scratch directory>",
    verification: "<the repo's verification commands>",
    mode: "reverify",
    reverify: {
      issue: 123,
      branch: "claude/fix-123-<slug>",
      sha: "<rebased SHA>",
      base: "<origin/main it was rebased onto>",
      verified_tree: "<git rev-parse '<rebased SHA>^{tree}'>",
      previousSha: "<needsReverify sha>",
      previousBase: "<needsReverify base>",
      submission: "<the needsReverify entry's submission_text>",
      scopeFence: "<the entry's scope_fence; leave the key out when the entry has none>"
    }
  }
})
```

It runs two agents and nothing else: the workflow's adversarial pass on
`git diff <base> <sha>`, then the verifier. It does not admit, claim, label,
create a worktree or branch, or dispatch a fixer, and it has no rework
round. The worktree is `<worktreeRoot>/fix-<issue>`, the one the original
run created. Pass the same `worktreeRoot` as the original run: a different
one names a worktree that does not hold the branch, so the branch binding
fails and the item is escalated, never verified.

The verifier's dispatch binds the branch tip to `sha`, checks that
`merge-base <sha> origin/main` is `base` and that the tree is
`verified_tree`, and returns REWORK if either differs. It says the
verifier profile's tree comparison (check 2) uses this `verified_tree` in
place of the submission's, which belongs to `previousSha`. It runs `git
range-diff <previousBase>..<previousSha> <base>..<sha>`, so it can grade
every difference between the change verified before and the rebased one.
Then it reviews and verifies the rebased SHA in full. The original
submission, when given, reaches it inside a data fence; its ce-work
evidence covers `previousSha`, and the rebased SHA's lack of a ce-work
block of its own is not a finding. `submission_text` in `needsReverify` is
cleaned like other agent text (printable ASCII, `\u` escapes) with a
20,000-character cap.

The scope fence, when given as `scopeFence`, reaches the verifier and the
pass inside a data fence, so the verifier's out-of-fence check has
something to check against. `needsReverify` carries `scope_fence` only when
the lead's `scopeFence` set it. The admission agent's fence is a guess from
issue text anyone can edit, so it is never carried: passed back, it would
replace the tighter default as the binding fence. Without one, the
dispatch says the fence is the files changed in
`<previousBase>..<previousSha>`, and that a file new to the rebased change
in the range-diff is out of fence.

A throw from the verifier agent reports the item under `blocked` with the
error, cleaned, as the fix-mode lane does; it never fails the workflow.

Every `reverify` field is checked before any agent runs, and a bad one
stops the workflow: `issue` a positive integer; `branch` matching
`claude/fix-<issue>-<slug>` (lowercase letters, digits and `-`), the shape
admission gives that issue; `sha`, `base`, `verified_tree`, `previousSha`
and `previousBase` full 40-character lowercase hex, with no surrounding
space; `sha` different from `previousSha`; `base` different from
`previousBase` (the same base means it was never rebased onto the earlier
fix); `submission`, when present, text; `scopeFence`, when present,
non-empty text. Any other key is an error, as are `issues`, `scopeFence` and
`maxFixes`, which only mean something to admission, a `reverify` object
without `mode: "reverify"`, and any `mode` other than `fix` or `reverify`.

The report has the usual shape. A VERIFIED for exactly `sha`, with a
findings list and no BLOCKING finding, is under `readyToOpen` with the new
SHA, base and verified tree, the pass's `adversarial_review`, the
verifier's `coverage`, and `reverifiedFrom` (the previous SHA). Anything
else (REWORK, LEAD DECISION, ESCALATE, or a VERIFIED that fails those
checks) is under `escalated`, for the lead to send back to a fixer; no
verdict is `blocked`. Below the `minBudgetPerFix` budget nothing runs and
the item is `deferred`. The claim label stays on the issue throughout.

## How deep the verifier's review is inside fix-queue

Agents dispatched by `agent()` in a workflow have no Agent tool. Inside
fix-queue the verifier's `ce-code-review` therefore cannot dispatch its
reviewer subagents, and it runs degraded. #90's acceptance run on #97
(2026-10-09) showed the result: in one round the verifier fell back to a
`claude -p` adversarial read, and in the next only the orchestrator's own
correctness read ran (issue #116).

So the review behind a fix-queue VERIFIED is:

- **`ce-code-review`, degraded.** The verifier still runs it on the exact
  SHA, as its profile requires, and reports the `depth` it returns. Its
  reviewer subagents do not run.
- **The workflow's adversarial pass.** A separate agent, with its own context,
  reviews exactly `git diff <base> <sha>` and returns findings with
  severities. It is read-only: no edits, no git or `gh` writes. Its output
  reaches the verifier inside a data fence, like every other untrusted text.
  It replaces the `claude -p` fallback for the adversarial lens.
- **The verifier's own grading.** The verifier grades each finding from the
  pass against the code, confirming it with a severity or saying why it
  does not hold. A finding counts only as the verifier grades it. In
  `coverage` it says that `ce-code-review`'s reviewer subagents did not run
  and that the adversarial lens came from the workflow's pass.

When the pass throws, returns nothing, reviews a SHA other than the submitted
one, or returns no findings list, it counts as not run. The verifier's
dispatch then says the adversarial lens is missing and that `coverage` must
say the review was degraded, with the reason. That reason sits in the
verifier's prompt outside any fence, so it is one of four fixed texts (the
agent failed, returned nothing, reviewed another commit, returned no findings
list) plus SHAs that are full hex ids. Nothing the reviewer or an error wrote
reaches it; a thrown error's message goes only to the log, with `<` and `>`
escaped.

The report records the pass either way, as `adversarial_review`, which does
not depend on the verifier's wording. When the pass ran, it carries the
count of its findings by severity, computed by the workflow, for example
`ran: 1 BLOCKING, 0 SHOULD-FIX, 2 NOTE` (an unknown severity is counted as
`other`, never echoed). So a BLOCKING finding the verifier dismissed still
shows in the report. This is shallower than an interactive verifier, whose
`ce-code-review` runs its full reviewer roster. That gap is an accepted limit
(this plugin's ADR 0002). Read `coverage` and `adversarial_review` before
trusting a VERIFIED from this workflow.

## Fail-closed and injection rules

- **Fail closed.** An item counts as VERIFIED only when the verifier returns
  `VERIFIED` for exactly the submitted SHA, with no BLOCKING finding. Every
  other case gives no VERIFIED:
  - a missing or different SHA in the verdict is escalated
  - VERIFIED with any BLOCKING finding is escalated (the verifier profile
    defines VERIFIED as having none)
  - a submission whose `branch` or `worktree` is not the one the issue was
    given goes back to the fixer (as the field-only retry, or after it as a REWORK round), and the verifier is told to confirm
    that `git -C '<worktree>' rev-parse '<branch>'` prints the submitted SHA,
    so the SHA the lead is handed is the tip of the branch it pushes
  - a missing verdict is blocked
  - a fixer status other than `submitted` is blocked
  - a submission whose `sha`, `base` or `verified_tree` is not a full 40-character hex id, or whose `base` is not the base it was cut from, counts as missing evidence and goes back the same way
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
  gathered from an issue, every submission field, the adversarial pass output and every verdict enter a
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
  verifier's verdict. The one piece of the adversarial pass that reaches the
  verifier outside a fence, its not-run reason, is fixed text plus full hex
  SHAs only (see "How deep the verifier's review is inside fix-queue").
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
4. missing fields: these never reach the verifier, and the first such failure
   is a field-only retry that uses no rework round
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
    never reaching the verifier, with the field-only retry prompt naming the
    field
16. ASCII, fullwidth, zero-width and guillemet fence closers from an issue
    title, ground truth, scope or submission: every fenced body is one JSON
    line with no bracket or lookalike, and no forged header line appears
17. a different branch or worktree never reaching the verifier, and the
    branch-tip check in the verifier's dispatch of the corrected submission
18. VERIFIED with a BLOCKING finding escalated
19. a multi-line text sent as the SHA never appearing outside a fence in the
    field-only retry prompt; the workflow's own check labelled; no "round 3 of 2"
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
28. with `scopeFence` given, an issue the admission agent returns that the
    fence does not name reported as blocked, with no agent run and no guessed
    scope
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
36. with `scopeFence` and `issues`, an unfenced issue absent from the admission
    prompt, so never labelled or branched; the cap counting only fenced
    issues; the unfenced issue reported once under `skipped` (issue #114)
37. with `scopeFence` and no `issues`, the fenced issues in ascending order
    as the candidates, not the backlog sweep; a dropped fenced candidate
    accounted for
38. a `scopeFence` naming none of `issues`: no admission agent runs, and the
    log says why
39. every SHA trimmed in escalated and blocked results and their history (a
    rework cap, a LEAD DECISION, a VERIFIED for another SHA, a VERIFIED with a
    BLOCKING finding or without a findings list, a blocked fixer, a null
    verdict, a budget stop), and in the VERIFIED log line
40. an unfenced issue in `issues` that the admission agent returns anyway
    reported exactly once: under `blocked` when returned as admitted, with the
    agent's reason when listed under its own skipped (issue #114)
41. a field-only failure in round 0 leaving both rework rounds to the
    verifier: with a verifier that always returns REWORK, the fixer runs as
    r0, r0 retry, r1, r2 and the verifier sees the code three times; the
    retry is marked `fieldRetry` in `history` (issue #116)
42. at most one field-only retry per issue: a fixer that always returns bad
    fields runs r0, r0 retry, r1, r2 and never reaches the verifier; a retry
    in a later round still carries the verdict that opened the round
43. the retry prompt's own sentences, outside the fences: a field-only
    retry, from the workflow's own check, using no rework round, naming the
    field
44. the adversarial pass running after the field check and before the
    verifier, as a plain agent, on exactly `git diff <base> <sha>` in the
    issue's worktree, read-only; its output fenced in the verifier's
    dispatch; the review-depth paragraph present, with the instruction to
    grade each finding outside the fences; `adversarial_review` counting
    `1 BLOCKING, 0 SHOULD-FIX, 0 NOTE`
45. a pass that returns nothing, throws, reviews another SHA or returns no
    findings list: the verifier still runs, is told the lens is missing and
    that `coverage` must say the review was degraded, sees no pass output,
    the not-run sentence carries each case's fixed reason, and the report
    says `not run: <reason>`
46. the pass running once per submission that reaches the verifier, on the
    new SHA in a rework round, never on one the field check stopped;
    `adversarial_review` in `needsReverify`
47. a forged closer, line separator and tag character in the pass output
    staying inside its fence as printable ASCII
48. the budget checked before a field-only retry: a stop there is
    escalated with the reason, never deferred
49. a forged `coverage` claim and a fence opener sent as the reviewer's
    `sha`, and as a thrown error's message: none of it appears outside a
    fence in the verifier's prompt, in `adversarial_review`, or as raw
    `<<<` in the log (rework round 1 on a4995c8)
50. `adversarial_review` counting findings by severity
    (`ran: 1 BLOCKING, 0 SHOULD-FIX, 2 NOTE`), and an unknown severity or a
    null finding counted as `other`, never echoed
51. the remedy end to end (issue #113): a lane run reports a
    `needsReverify` item naming `mode 'reverify'`; a reverify run on its
    rebased SHA runs only the pass and the verifier, with the branch
    binding, identity checks, range-diff against the previous SHA and base,
    the claim left alone and the original submission fenced, and reports it
    under `readyToOpen` with the new SHA, base and tree and `reverifiedFrom`.
    It also pins the re-verify claim and worktree lines, the REWORK-on-identity
    and tree-comparison sentences, the "`sha` is <rebased>" instruction, and
    `readyToOpen.sha` as exactly the rebased SHA
52. malformed reverify args throwing before any agent runs: an unknown
    mode, `reverify` without the mode or the mode without it, a non-object,
    `issues`, `scopeFence` or `maxFixes` alongside, a bad issue (including 0
    and -1 with a branch that matches them), a branch for another issue or
    with shell text or capitals, an unknown key, `sha` equal to
    `previousSha`, `base` equal to `previousBase`, a non-text submission, a
    blank or non-text `scopeFence`, and every SHA field missing, short,
    uppercase, padded or not hex
53. REWORK, LEAD DECISION, ESCALATE, VERIFIED for another SHA, VERIFIED
    with a BLOCKING finding and VERIFIED without a findings list escalated
    after one verifier run and no fixer; no verdict blocked
54. a forged closer and tag and separator characters in the original
    submission and the verdict staying inside fences as printable ASCII;
    no submission said plainly
55. below the budget, nothing runs and the item is deferred
56. `needsReverify` carrying the trimmed base and verified tree
57. `needsReverify` carrying the cleaned `submission_text` (over 500
    characters kept), and `scope_fence` only when the lead set it; an entry
    from an admission-derived fence carrying none, and a reverify run built
    from it naming the previous diff as the fence; a supplied `scopeFence`
    with a forged closer staying fenced and printable in the pass and
    verifier prompts
58. a verifier agent that throws in reverify mode: the item under `blocked`
    with the cleaned error, the workflow not rejected

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
- for issue #114: the fence ignored when building the admission candidates;
  the candidate set taken from `issues` instead; the skip for an unfenced
  issue removed; the no-candidate guard removed; a raw SHA in the VERIFIED
  log line; `shaText()` returning the untrimmed SHA; either half of the
  once-only check for an unfenced issue the agent returned anyway removed;
  the no-admission log line removed
- for issue #116: no field-only retry; unbounded field-only retries; the
  retry not marked in its label; the retry prompt's no-round sentence
  removed; the round's opening verdict dropped from a retry prompt; the
  retry not marked in `history`; the adversarial pass never called; its
  reviewed-SHA check dropped; its findings-list check dropped; a throw from
  the pass not caught; the pass output relayed outside a fence; the
  "coverage must say degraded" instruction dropped; the review-depth
  paragraph dropped; `adversarial_review` dropped from `needsReverify`;
  the pass diff not taken from the base; a budget stop before the
  field-only retry reported as deferred; for rework round 1: the
  instruction to grade the findings dropped; the reason dropped from the
  not-run sentence; the reviewer's raw `sha` in the reason; the error
  message in the reason; the counts reduced to `ran`; the `other` count
  dropped; the log escape dropped
- for issue #113 rework round 1: the issue `<= 0` guard dropped; the
  `base === previousBase` check dropped; the scope-fence type check
  dropped; the "If either differs, return REWORK" sentence and the
  tree-comparison sentence dropped; the re-verify claim and worktree lines
  changed; the "`sha` is" instruction dropped; `readyToOpen.sha` taken from
  `previousSha`; `submission_text` dropped from `needsReverify`, left
  uncleaned, or capped at 500; the scope fence dropped, a supplied fence
  unfenced, and the no-fence sentence dropped. Taking
  `readyToOpen.sha` from the shared result's `shaText(sha)` instead of the
  argument is an equivalent mutant: the argument is already a validated,
  untrimmed full hex id, so `shaText` returns it unchanged
- for issue #113 rework round 2: the admission agent's fence carried
  into `needsReverify` again; the reverify verifier's catch removed;
  `readyToOpen.sha` taken from the verdict's `sha` (test 51's verifier
  returns it with a trailing newline)
- for issue #113: the mode check, the reverify-without-mode check, the
  admission-args check, the unknown-key check, the issue check, the
  sha-equals-previousSha check and the submission type check each removed;
  the branch pattern not bound to the issue, or unanchored; the hex check
  trimming its input; the VERIFIED checks skipped in reverify mode; a
  non-VERIFIED verdict reported as verified; the escalated reason left
  unsanitized; the original submission unfenced; the branch binding, the
  identity line, the range-diff or the claim sentence dropped from the
  verifier's dispatch; the reverify budget check removed; the pass skipped;
  reverify mode falling through to admission; `base` dropped from
  `needsReverify`; `reverifiedFrom` dropped; the old remedy text. The
  non-object check is an equivalent mutant: an array's index keys fail the
  unknown-key check, and an empty one fails the issue check

The first real run is the lead's one-issue acceptance run.
