# The residual rule

One rule decides what happens to a gap that a fix, a review or a verification
finds: fix it now, ask the maintainer, or file it. The root-cause gate, the
fixer, the verifier and the lead all apply this rule. None of them restates it.

## What a residual is

A gap is a **residual** only when all three hold:

- It is real: there is evidence (a file and line, a failing command, a quoted
  claim), not a suspicion.
- It is outside the defect class that the root-cause gate named for the issue.
  A site of that defect class is the issue's own work, not a residual.
- It does not block the issue's Done-when. A gap that stops the issue's
  acceptance criteria from being true is part of the issue.

## The six questions

Ask these in order for each gap. Stop at the first yes and do what it says.

1. **Does it make the fix wrong, unsafe or not done?** Fix it now.
2. **Was it introduced by the fix, or does it leave a stale or false claim?**
   Fix it now. A doc, comment or message that the change made untrue counts.
3. **Is it the same defect class, somewhere else?** Fix it now. The root-cause
   gate's inventory should already list it; if it does not, say so.
4. **Is it cheap and reversible, in files the change already touches?** About
   30 minutes, and no new decision. Fix it now.
5. **Does it need a decision only the maintainer can make?** Ask, with a
   recommended option, and work on the recommended option meanwhile.
6. **Otherwise, file it.** File a triaged issue before the PR is marked ready,
   and link it from the PR body.

## What never qualifies a gap for filing

Process reasons never move a gap to question 6. These are process reasons:
"the verifier passed", "the PR is large", "the reviewer did not ask for it"
and "it was not in the issue". Answer questions 1 to 5 on the gap itself.

## Who applies it

- **The root-cause gate** uses the defect class and inventory to decide what is
  the issue's own work (question 3) before any fix starts.
- **The fixer** applies it to gaps found while implementing, and lists each
  filed or asked gap in its submission's `limitations`.
- **The verifier** applies it to each finding: a yes to questions 1 to 4 makes
  the finding BLOCKING. A yes to question 5 or 6 is a non-blocking finding
  that names its question, for the lead to ask about or file. It does not
  change what `LEAD DECISION` means in the verdict.
- **The lead** files the question-6 issues before marking the PR ready, and
  links them from the PR body.
