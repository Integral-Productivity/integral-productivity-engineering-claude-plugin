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
3. Every file in `git diff --name-only <base>..<sha>` appears in the
   `changed_files` of one of the submitted blocks. A file outside them was
   changed outside ce-work.
4. `git rev-parse <sha>^{tree}` equals the submission's `verified tree`.

## Why a tree hash (the issue comment, 2026-10-09)

The return-to-caller block carries no commit SHA or diff digest. When ce-work
commits every unit itself, the SHA is ce-work's own last commit. When it leaves
changes for the caller to commit ("canonical commit deferred to caller"), the
verifier could only match test counts against the block; nothing tied the block
to the tree under review. The fixer therefore records the tree ce-work
verified, at the moment it returns:

- ce-work left changes uncommitted: stage exactly its uncommitted
  `changed_files` by path, then `git write-tree`. Committing those same paths
  by path (fixer Process step 6) produces a commit with that tree.
- ce-work left nothing: `git rev-parse HEAD^{tree}`.

The verifier compares it with `git rev-parse <sha>^{tree}`. A tree hash, not a
commit hash, so a fixer may still write its own commit message.

Smoke evidence, 2026-10-09, on a throwaway repo (git 2.x), with an unrelated
untracked file present throughout:

| Case | Verified tree | Committed tree | Match |
|---|---|---|---|
| ce-work committed one unit; the caller staged and committed the leftover file by path | `d11b5fa…` | `d11b5fa…` | yes |
| ce-work left nothing; `HEAD^{tree}` recorded | `d11b5fa…` | `d11b5fa…` | yes |
| the caller edited a file after ce-work returned, then committed | `d11b5fa…` | `63003ac…` | **no**: REWORK |
| a message-only commit after the last recorded tree | `63003ac…` | `63003ac…` | yes |

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
