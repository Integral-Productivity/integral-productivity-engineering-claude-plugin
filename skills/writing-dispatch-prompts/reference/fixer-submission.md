# Fixer submission format

The message a `fixer` (this plugin's `agents/fixer.md`) sends to the verifier
and the lead when it submits a SHA. The `verifier` checks submissions against
this list. Every field is required; a field that does not apply says so
("none", "not applicable") rather than being left out.

Send one message whose first line says which issue and SHA it covers, then:

- `issue`, `branch`, `worktree` (absolute path)
- `sha` (`git rev-parse HEAD`) and `base` (`git merge-base HEAD origin/main`)
- `files` and `counts`: `git diff --stat <base>..<sha>` and `--shortstat`
- `verification`: each command with its actual result and counts, never just "passing"
- `tests`: which pin the new behavior (they must fail at the base) and which are regression pins already passing at the base, labeled as such
- `ce-work result`: the return-to-caller block, verbatim; on a resubmission, every block that covers the submitted work
- `verified tree`: the git tree ce-work verified, recorded as your first act after its last return for this submission, before any edit, staging or commit. If ce-work left nothing uncommitted, record `git rev-parse 'HEAD^{tree}'`. Otherwise record it in a temporary index, so neither your real index nor anything else staged there counts: `T=$(mktemp) && GIT_INDEX_FILE=$T git read-tree HEAD && GIT_INDEX_FILE=$T git add -A -- <all of ce-work's uncommitted changed_files, none omitted> && GIT_INDEX_FILE=$T git write-tree; rm -f "$T"`. The submitted SHA's tree (`git rev-parse '<sha>^{tree}'`) must equal it, and every path in every block's `changed_files` must be in the diff (see `ce-work-evidence.md`). A message-only commit keeps them equal; any later edit, or a merge from main, breaks the match, so make it through ce-work and record the new tree. See `ce-work-evidence.md`
- `plan files`: the absolute path of every plan file you wrote for this submission, kept, plus any non-null `plan_checkpoint` from the return block
- `acceptance criteria`: each one from the dispatch prompt's ground truth (or the issue, where the dispatch defers to it): where met, or why not
- `guard changes` (when a guard changed): every input the SHA passes that the base blocks, each with its explanation and any pinning test, or "none"
- `egress control`: the visibility result of each egress-gate run and the control set under requirement 3
- `limitations`: anything you could not verify here, said plainly, including a `.compound-engineering/config.local.yaml` the repo does not ignore

On a resubmission after REWORK, also say whether the round re-invoked ce-work
or continued within the earlier run, and list each finding with the commit that
addresses it.
