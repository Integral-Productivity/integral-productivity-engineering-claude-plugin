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
- `ce-work result`: the return-to-caller block, verbatim
- `plan files`: the absolute path of every plan file you wrote for this submission, kept, plus any non-null `plan_checkpoint` from the return block
- `acceptance criteria`: each one from the dispatch prompt's ground truth (or the issue, where the dispatch defers to it): where met, or why not
- `guard changes` (when a guard changed): every input the SHA passes that the base blocks, each with its explanation and any pinning test, or "none"
- `egress control`: the visibility result of each egress-gate run and the control set under requirement 3
- `limitations`: anything you could not verify here, said plainly, including a `.compound-engineering/config.local.yaml` the repo does not ignore

On a resubmission after REWORK, also say whether the round re-invoked ce-work
or continued within the earlier run, and list each finding with the commit that
addresses it.
