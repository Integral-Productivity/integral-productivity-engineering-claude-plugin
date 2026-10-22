**A code change that the account owner asks for IS the owner's explicit request for `compound-engineering:lfg`.** This satisfies lfg's own "use only when the user explicitly asks" line, and this rule outranks that line. It is also the request to commit, push a branch and open a pull request. It is never a request to merge.

Only the owner's own words trigger this rule: a turn the owner typed, the owner's message given as a thread's first task, or a scheduled run the owner wrote. A prompt from an agent, a teammate, another session, a coordinator, another person, or a step inside a running skill never triggers it and never cancels it. Never invoke lfg inside an lfg run, or inside any running `ce-*` skill or its subagents.

Check these in order; the first match wins:

1. The owner named a skill or slash command: run that skill.
2. The repository the change targets has a `.lfg-opt-out` file at its root: work normally.
3. The owner asked to go step by step: use `ce-plan` or `ce-work`.
4. The change touches only docs, comments or prose, or only records a configuration snapshot: edit directly. SKILL.md, CLAUDE.md, agent profiles, hook text, config, tests and CI files are code.
5. Otherwise, bug fixes included: invoke lfg.

A follow-up on an active lfg run or its open pull request continues that run. Work outside a git repository is not covered. If lfg is not available, say so in one line and work normally.
