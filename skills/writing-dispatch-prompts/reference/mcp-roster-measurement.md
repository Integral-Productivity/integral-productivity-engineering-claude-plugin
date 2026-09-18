# Measuring a chip's MCP roster

How to check what a dispatched session actually loads, and how the scoped roster
in `SKILL.md` was measured. Re-run it when the machine's plugin or connector set
changes. The numbers below describe one machine on one day and will drift.

## Recipe

A headless session exits as soon as it answers, before anything can be sampled.
Hold it open by feeding its prompt through a FIFO in `stream-json` input mode,
then sample the process tree while it waits for more input.

```bash
#!/bin/bash
# usage: measure.sh <label> [extra claude flags...]
label=$1; shift
fifo="$PWD/$label.fifo"; rm -f "$fifo"; mkfifo "$fifo"
claude -p --input-format stream-json --output-format stream-json --verbose "$@" \
  < "$fifo" > "$label.jsonl" 2> "$label.err" &
root=$!
exec 3> "$fifo"
echo '{"type":"user","message":{"role":"user","content":"Reply with the single word ok."}}' >&3
sleep 45                                   # let every server finish connecting
ps -A -o pid=,ppid=,rss=,command= > "$label.ps"
exec 3>&-; kill "$root"; wait "$root" 2>/dev/null; rm -f "$fifo"
echo "root pid: $root"
```

Then:

- **Roster.** The first `{"type":"system","subtype":"init"}` line in
  `<label>.jsonl` lists `mcp_servers` and `tools`. Count both.
- **Processes and memory.** Walk the descendants of the root pid in
  `<label>.ps` and sum the RSS column (KB). Report the children separately from
  the `claude` process itself: the children are what the roster costs.

Compare:

```bash
./measure.sh before
./measure.sh after --strict-mcp-config --mcp-config '{"mcpServers":{}}'
```

## Results, 2026-09-17

| | Ambient roster | Empty strict roster |
|---|---|---|
| MCP servers in `init` | 172 | 0 |
| Tools in `init` | 1,724 | 27 |
| Child processes | 9 | 0 |
| Child RSS | 253 MB | 0 MB |
| Task completed | yes | yes |

The ambient children were `@playwright/mcp` (two processes), `episodic-memory`,
`flying-logic-mcp` (two), `claude-mermaid`, and `browser-use` (two). The
`claude` process itself measured 109 MB and 146 MB in the two runs. That
difference is heap variance, not a roster effect.

Admitting one named server composes as expected: strict mode plus a second
`--mcp-config` file holding only `mermaid` loaded exactly that server, connected,
with 29 tools.

**Why these numbers are lower than #50's.** Issue #50 counted 22 processes and
about 330 MB per chip on interactive `claude -n … -w …` sessions that had been
running for 22 hours. At the time of this measurement, eight plugin servers
were in Claude Code's cached-connection-failure state and did not spawn: the
five `@zapier/*-connector` servers #50 lists, `google-calendar`, `imessage`, and
`pdf`. A machine where those connect will show a larger ambient tree. The empty strict roster is zero either way.
