# ce-work evidence: what binds a submission to the SHA

The `fixer` profile requires every fix to go through `compound-engineering:ce-work`
in Return-to-Caller Mode, and the `verifier` profile rejects a submission
without that evidence (issue #89). This file records what the evidence is, what
it can and cannot prove, and why there is no commit hook.

## The gate (verifier check 2)

REWORK unless all of these hold:

1. The submission carries ce-work's return-to-caller block, verbatim, with
   `standalone_shipping_skipped: true`. On a resubmission it carries every
   block covering the submitted work and says whether the round re-invoked
   ce-work or continued within the earlier run.
2. Each block's `status` is `complete`. A `blocked` or `failed` block means the
   fixer should have stopped and reported (fixer requirement 1), not submitted.
3. Containment runs both ways:
   - every file in `git diff --no-renames --name-only <base>..<sha>` appears
     in the `changed_files` of one of the submitted blocks; a file outside
     them was changed outside ce-work;
   - every path in every submitted block's `changed_files` appears in
     `git diff --no-renames --name-only <base>..<sha>`. A path missing from it
     was left out of the commit, for example an uncommitted deletion the fixer
     did not stage. There is no exception: a path that ends the range
     unchanged from `<base>` also fails, and that false REWORK is accepted as
     the fail-closed direction (lead ruling, 2026-10-09).

   `--no-renames` lists a rename as its deletion and its addition, so both
   the old and the new path are compared; with rename detection on, only the
   new path would be listed.
4. `git rev-parse '<sha>^{tree}'` equals the submission's `verified tree`.
   Quote the rev: unquoted, `^{tree}` fails under zsh's `extendedglob`.

## Why a tree hash (the issue comment, 2026-10-09)

The return-to-caller block carries no commit SHA or diff digest. When ce-work
commits every unit itself, the SHA is ce-work's own last commit. When it leaves
changes for the caller to commit ("canonical commit deferred to caller"), the
verifier could only match test counts against the block; nothing tied the block
to the tree under review. The fixer therefore records the tree ce-work
verified, as its first act after ce-work returns (fixer requirement 4), before
any edit, staging or commit:

- ce-work left nothing uncommitted: `git rev-parse 'HEAD^{tree}'`.
- ce-work left changes uncommitted (both shapes occur: return-to-caller.md
  says ce-work commits each completed unit, yet runs also hand files back):
  build the tree in a temporary index, so nothing else in the real index
  counts and the real index is untouched:
  `T=$(mktemp) && GIT_INDEX_FILE=$T git read-tree HEAD && GIT_INDEX_FILE=$T git add -A -- <all uncommitted changed_files, none omitted> && GIT_INDEX_FILE=$T git write-tree; rm -f "$T"`.
  Committing those same paths by path (fixer Process step 6) produces a
  commit with that tree. `add -A` also records a file ce-work deleted.

Recording it at return is what makes it a binding. Recorded at commit time,
it would hash whatever the working tree held then, so an edit made after ce-work
returned would be hashed in and match by construction (review of the first
version, 2026-10-09).

The verifier compares it with `git rev-parse '<sha>^{tree}'`. A tree hash, not a
commit hash, so a fixer may still write its own commit message.

Smoke evidence, 2026-10-09, on throwaway repos. The first table recorded the
tree at commit time, as the first version of this gate did. The second uses the
temporary-index recipe, recorded at return.

| Case (tree recorded at commit time) | Verified tree | Committed tree | Match |
|---|---|---|---|
| ce-work committed one unit; the caller staged and committed the leftover file by path | `d11b5fa…` | `d11b5fa…` | yes |
| ce-work left nothing; `'HEAD^{tree}'` recorded | `d11b5fa…` | `d11b5fa…` | yes |
| a message-only commit after the last recorded tree | `63003ac…` | `63003ac…` | yes |

| Case (tree recorded at return, temporary index) | Verified tree | Committed tree | Match |
|---|---|---|---|
| ce-work committed one unit and left one file edited and one deleted; an unrelated file was staged in the real index before the caller committed the two leftovers by path | `d11b5fa…` | `d11b5fa…` | yes |
| the same, but the caller edited the leftover file after ce-work returned, then committed | `d11b5fa…` | `87c3477…` | **no**: REWORK |

The tree match alone runs one way. The adversary review (2026-10-09) showed a
fixer can leave one of ce-work's uncommitted files out of both the recorded
tree and the commit, and still match. Reproduced: ce-work changed `a.txt` and
deleted `d.txt`; the fixer recorded and committed only `a.txt`; the trees
matched, and `d.txt` was missing from `git diff --name-only <base>..<sha>`. The
reverse containment check in item 3 is what catches it.

What it proves: the SHA under review is exactly the tree the fixer says ce-work
verified, so any later edit shows up as a mismatch. What it cannot prove: that
the block and the tree came from a real ce-work run. Both are self-reported by
the fixer. The verifier's own checks (ce-code-review, fail-before/pass-after,
mutation, repo verification on the SHA) stay the independent evidence.

## Receipt investigation: does ce-work leave a run receipt on disk?

Answer, for compound-engineering 3.30.4: **not for native execution**, which is
the route the fixer profile uses on every repo that is not `PUBLIC` and on any
repo without an external engine configured.

Evidence:

- `ce-work/references/return-to-caller.md`: "`run_id`: durable external run
  identifier, or `null` for native execution". `unit_receipts` and
  `implementation_run` belong to the external cross-model controller.
- `ce-work/scripts/unit_workspace_state.py` writes durable run state only for
  that controller, under `CE_WORK_RUNS_ROOT` or
  `<TMPDIR or /tmp>/compound-engineering-<uid>/ce-work/<run-id>/`.
- On this machine, after a day of native return-to-caller runs (IP-eng #91,
  #92 and #93, ten invocations before this one), `/tmp/compound-engineering-501/` has no
  `ce-work/` directory at all, while `ce-code-review/` holds dozens of run
  directories. Every one of those ce-work blocks reported `run_id: null`.

## The optional commit hook: declined

The issue offered a `PreToolUse` hook that warns about or blocks `git commit` on
`claude/fix-*` branches with no receipt for the branch. Declined, because:

- Native runs, the normal route, leave no receipt, so the hook would warn on
  or block every legitimate fixer commit. The issue's own condition was "do
  not ship a gate that loops on a legitimate commit".
- ce-work makes its own per-unit commits. A blocking hook would block ce-work
  itself mid-run.
- The binding above already turns "committed without ce-work verifying it"
  into a mechanical mismatch at the verifier, without adding a `hooks/`
  surface to this plugin.

Revisit if compound-engineering starts writing a durable receipt for native
runs; `tools/check-ce-pins.mjs` is where a pin on that receipt would go.
