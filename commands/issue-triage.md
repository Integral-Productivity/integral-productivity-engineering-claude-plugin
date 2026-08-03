---
description: Triage GitHub issues in an Integral-Productivity repo. Ground-truths each issue against live state, assigns one state and one category from the repo's own vocabulary, and infers the `handling:route:*` role accountable for the work from GlassFrog — applying it when one role clearly owns it, escalating when it is genuinely unclear.
---

Invoke the `issue-triage` skill to resolve the repo's label vocabulary, ground-truth the issue against live `main` / ADRs / cross-referenced issues before assigning state, classify it, and infer the accountable GlassFrog role per SAE-009 — taking the apply, escalate, or degrade branch as the confidence gate directs.

Issue number, backlog scope, or stated intent (if any): $ARGUMENTS
