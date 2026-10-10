---
title: ce-code-review reviewer handbacks can fail silently; a verifier must read every reviewer artifact from the run dir
date: 2026-10-09
category: workflow-issues
module: agents/verifier
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - A verifier (or any agent) runs ce-code-review and dispatches reviewer subagents
  - The dispatching agent ends its turn or goes idle before every reviewer has returned
  - A lead session receives an unexpected message from a reviewer subagent it did not start
symptoms:
  - A reviewer subagent reports that its handback could not be delivered because the agent that started it had exited
  - A verdict lists fewer reviewers than ce-code-review dispatched, or reads like a complete pass after a partial review
  - The lead receives reviewer results directly, addressed to nobody in particular
tags: [ce-code-review, verifier, subagent-handback, agent-teams, fix-queue, review-coverage]
---

# ce-code-review reviewer handbacks can fail silently; a verifier must read every reviewer artifact from the run dir

## Context

In the 2026-10-09 lead/fixer/verifier session (PRs #131, #140, #144, #150, #152, #158 and #161), each verifier ran `ce-code-review`. In multi-agent mode it dispatches several reviewer subagents (correctness, testing, security, adversarial, maintainability, agent-native, project-standards), then a merge leaf, a validator and a report leaf. Those subagents return their results to the agent that launched them.

That return failed repeatedly, without the work itself failing:

- **#114's verifier.** The adversarial-reviewer subagent "wrote its artifact (adversarial.json) but ended without a hand-back message". The verifier used the artifact on disk as the result.
- **#128's verifier.** Two adversarial subagents "stopped without sending a final report". The verifier read their findings from the files they wrote.
- **#113's verifier, round 1.** The adversarial reviewer's handback "could not be delivered because the agent that started it had exited". The message reached the lead session instead, and the lead had to relay it back to the verifier.
- **#113's verifier, rounds 1 and 2.** In both rounds, "all 7 reviewer, merge, validator and report-leaf handbacks failed in-band". The project-standards and testing reviewers each messaged the lead directly. The verifier recovered every result by reading the run dir.

The common cause: the verifier ended its turn (went idle, or finished and sent its verdict) while reviewer subagents were still running. When a reviewer finished, its spawner had no live turn to receive the handback.

## Guidance

**Treat the ce-code-review run dir as the source of truth, not the in-band returns.** Before writing a verdict, a verifier reads every reviewer artifact from the run directory. In-band handbacks are a convenience, not the record.

The run dir is under the CE scratch root, `/tmp/compound-engineering-<uid>/ce-code-review/<run-id>/`. A full-depth run in this session left these files there:

```
correctness.json  testing.json  security.json  adversarial.json
maintainability.json  agent-native.json  project-standards.json
synthesized-findings.json  validator-verdicts.json  review.json   # merge, validator, report
metadata.json  stages.jsonl  raw-returns.json  full.diff  intent.md
```

The verifier's routine:

1. After dispatching reviewers, don't end the turn until every reviewer has returned, or its artifact is on disk.
2. Before the verdict, list the run dir. For every reviewer that was dispatched, confirm that its `<reviewer>.json` exists and read it. A reviewer with no artifact counts as not run, and goes in the coverage line as a degradation.
3. State in the verdict's coverage line how results were collected ("all N handbacks failed in-band; every artifact read from disk; no reviewer lost"), so the lead can tell a complete review from a partial one.

**On the lead side:** when a reviewer subagent you didn't start sends you its result, relay it to the verifier that owns the run, and tell that verifier to read the run dir directly. Don't grade the finding yourself; the verifier owns the verdict.

## Why This Matters

A verdict built only from in-band returns silently drops every reviewer whose handback failed. The verdict still reads as a full review. That is the failure #96 was filed to prevent ("a verdict without ce-code-review evidence reads as a full pass"), arriving by another route. Here the review ran but its results never reached the verdict.

In this session the recovery worked only because each verifier happened to check the disk. Nothing in `agents/verifier.md` told it to. The profile says to report the review depth, but not where the review's results come from. Nor does the fix-queue workflow check that the verifier saw every reviewer: #149 tracks that the workflow can't prove a reviewer pass read the diff.

## When to Apply

- Any agent that runs `ce-code-review` in multi-agent mode and then writes a verdict or summary from it: a verifier profile, a fix-queue verifier, or a lead reviewing a PR.
- Any session where the reviewing agent may go idle between dispatching reviewers and collecting them. That is common for teammates that answer messages turn by turn.
- When a lead receives a message from an unfamiliar reviewer subagent: it is almost always a failed handback.

## Examples

**Before (in-band only, illustrative):** the verifier collects the adversarial reviewer's handback, sees none, and writes coverage as "adversarial lens: no findings". The reviewer actually raised three P2 findings in `adversarial.json`.

**After (artifact-first):** #113's round-2 verdict: "All 7 reviewer, merge, validator and report-leaf handbacks failed in-band. I read every artifact from disk and no reviewer was lost. Receipt: `/tmp/compound-engineering-501/ce-code-review/<run>/review.json`." The verdict included all seven reviewers' findings, including the project-standards reviewer's zero-findings result that only reached the lead in-band.

## Related

- #96: verdict first line must state the ce-code-review depth.
- #116: fix-queue runs the adversarial pass itself, because workflow agents have no Agent tool.
- #149: fix-queue can't prove a reviewer pass read the diff.
- #157: reverify follow-ups.
