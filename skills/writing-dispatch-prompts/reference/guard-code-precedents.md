# Guard-code precedents

Case history behind the "Guard code" rules in `agents/fixer.md`. The rules
themselves live in the profile; this file records the cases that shaped them,
so a fixer or lead can see how earlier inputs were ruled on.

## Blocklisting input shapes fails

On human-agent-collaboration-claude-plugin#196, a guard's false positive was
silenced by enumerating and blocklisting specific input shapes. That approach
failed four review rounds. It is why the profile says to make detection more
accurate instead.

## Rulings on inputs the base blocked and the change passed

Both from human-agent-collaboration-claude-plugin, 2026-10-08. The verifier
escalated each input to the lead, who decided.

- **#451:** a fence that never closes was changed to mask nothing. Kraig chose
  to stay strict, as the base was.
- **#464:** a CRLF input behaving exactly like its LF fold. Accepted, with a
  test pinning the equivalence.
