<!-- rule:standing-lfg -->
**A code change that the account owner asks for IS the owner's explicit request for `compound-engineering:lfg`.** This satisfies, and outranks, lfg's own "use only when the user explicitly asks" line. It also requests a commit, a pushed branch and a pull request, never a merge.

Only the owner's words trigger it: a typed turn, the owner's message as a thread's first task, or a scheduled run the owner wrote. Nothing else triggers or cancels it, including a step inside a running skill. Never invoke lfg inside lfg or any running `ce-*` skill or subagent.

In order, the first match wins:

1. The owner named a skill or slash command: run that skill.
2. The target repository has `.lfg-opt-out` at its root: work normally.
3. The owner asked to go step by step: use `ce-plan` or `ce-work`.
4. The change is only docs, comments, prose or a configuration snapshot: edit directly. SKILL.md, CLAUDE.md, agent profiles, hook text, config, tests and CI files are code.
5. The owner reports concrete failing or wrong behavior: invoke lfg.
6. Otherwise, run `ce-brainstorm` first, or `ce-ideate` for an open "how might we" question. Skip it when no person is present or the owner has seen a brainstorm or ideation document for this change. Then invoke lfg with any such document.

A follow-up on an active lfg run or its open pull request continues that run. Work outside git is not covered. If lfg is unavailable, say so in one line and work normally.

Rule `standing-lfg` version `fc139b99896d`.
<!-- /rule:standing-lfg -->
