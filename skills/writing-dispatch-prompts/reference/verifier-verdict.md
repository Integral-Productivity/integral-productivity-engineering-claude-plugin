# Verifier verdict format

The message a `verifier` (this plugin's `agents/verifier.md`) sends to the
fixer and the lead. Every field is required.

Its first line names the issue, the SHA, and the verdict. Then:

- `verdict`: `VERIFIED`, `REWORK (round n of 2)`, `LEAD DECISION`, or `ESCALATE`
- `sha`, `base`, and the review coverage, including any degraded mode
- each finding rated BLOCKING / SHOULD-FIX / NOTE, anchored to `file:line`
- each check with its result and its actual numbers
- each acceptance criterion with its status

What each verdict means, and how rulings and rounds are counted, stays in the
profile ("Verdict" and "Rework rounds").
