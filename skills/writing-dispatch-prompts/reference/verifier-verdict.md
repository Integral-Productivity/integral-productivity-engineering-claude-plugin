# Verifier verdict format

The message a `verifier` (this plugin's `agents/verifier.md`) sends to the
fixer and the lead. Every field is required.

Its first line names the issue, the SHA, the verdict, and the review depth:

```text
#96 at 1a2b3c4: REWORK (round 1 of 2); ce-code-review depth: full
#96 at 1a2b3c4: ESCALATE; ce-code-review not run: <reason>
```

- The verdict is exactly one of the four values below. No other word is a
  verdict. "CLEARED" is the adversary teammate's word, not a verifier's.
- The depth is the `depth` ce-code-review returned (`lite`, `focused` or
  `full`), or `not run: <reason>`, so a missing review shows at a glance. A
  verdict whose first line says `not run` is never `VERIFIED`.

Then:

- `verdict`: `VERIFIED`, `REWORK (round n of 2)`, `LEAD DECISION`, or `ESCALATE`
- `sha`, `base`, and the review coverage, including any degraded mode
- each finding rated BLOCKING / SHOULD-FIX / NOTE, anchored to `file:line`
- each check with its result and its actual numbers
- each acceptance criterion with its status

What each verdict means, and how rulings and rounds are counted, stays in the
profile ("Verdict" and "Rework rounds").
