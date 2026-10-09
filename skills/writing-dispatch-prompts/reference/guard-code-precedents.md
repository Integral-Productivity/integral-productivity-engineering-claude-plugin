# Guard-code precedents

Case history behind the guard-code rules in this plugin's `agents/fixer.md`
("Guard code") and `agents/verifier.md` (check 6). The rules themselves live in
the profiles; this file is the one record of the cases that shaped them, so a
fixer, verifier or lead can see how earlier inputs were ruled on.

The cases come from a sibling internal plugin. This plugin is public, so they
are cited without that repo's name or issue numbers (#97).

## Blocklisting input shapes fails

In a sibling internal plugin, a guard's false positive was silenced by
enumerating and blocklisting specific input shapes. That approach failed four
review rounds. It is why the profile says to make detection more accurate
instead.

## Rulings on inputs the base blocked and the change passed

Both from the same sibling internal plugin, 2026-10-08. The verifier escalated
each input to the lead, who decided.

- **Case A:** a fence that never closes was changed to mask nothing. The lead
  chose to stay strict, as the base was.
- **Case B:** a CRLF input behaving exactly like its LF fold. Accepted, with a
  test pinning the equivalence.

## Mutation found what fail-before/pass-after missed

Also from that sibling internal plugin, 2026-10-08: the verifier's mutation
check found rules the tests did not pin, twice in Case A and once in Case B.
Fail-before/pass-after had passed all three. It is why the verifier's check 5
(mutation) is required on top of check 4, never instead of it.
