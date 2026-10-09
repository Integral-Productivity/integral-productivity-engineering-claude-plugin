# Guard-code precedents

Case history behind the guard-code rules in this plugin's `agents/fixer.md`
("Guard code") and `agents/verifier.md` (check 6). The rules themselves live in
the profiles; this file is the one record of the cases that shaped them, so a
fixer, verifier or lead can see how earlier inputs were ruled on.

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

## Mutation found what fail-before/pass-after missed

Also from human-agent-collaboration-claude-plugin, 2026-10-08: the verifier's
mutation check found rules the tests did not pin, twice in #451 and once in
#464. Fail-before/pass-after had passed all three. It is why the verifier's
check 5 (mutation) is required on top of check 4, never instead of it.
