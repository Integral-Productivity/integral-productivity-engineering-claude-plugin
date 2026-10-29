// Reads a PostToolUse payload on stdin. If the call opened a pull request,
// prints additionalContext telling the agent to babysit it (ADR-0004).
// Every other path prints nothing and exits 0.

import { readFileSync, statSync } from 'node:fs';
import { join, delimiter } from 'node:path';

const PR_URL = /https?:\/\/[^\s"'\\/]+\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/;

export function isPrCreate(payload) {
  const name = payload?.tool_name ?? '';
  if (name === 'Bash') return /\bgh\s+pr\s+create\b/.test(payload?.tool_input?.command ?? '');
  return /^mcp__.+__create_pull_request$/.test(name);
}

export function findPr(response) {
  const text = typeof response === 'string' ? response : JSON.stringify(response ?? '');
  const m = PR_URL.exec(text);
  return m && { url: m[0], owner: m[1], repo: m[2], number: Number(m[3]) };
}

function onPath(bin, env) {
  return (env.PATH ?? '').split(delimiter).some((d) => {
    try { return d && statSync(join(d, bin)).isFile(); } catch { return false; }
  });
}

export function instruction(pr, env = process.env) {
  const local = env.CLAUDE_CODE_REMOTE !== 'true' && onPath('gh', env);
  const head = `You just opened pull request ${pr.url}. It is yours until it is merged, closed, or looks ready; do not stop at "PR opened".`;
  const never = 'Never merge it; merging stays with a human.';
  if (local) {
    return `${head} Now run \`/compound-engineering:ce-babysit-pr ${pr.url}\` with posture \`target\`. ${never}`;
  }
  return `${head} This session cannot run ce-babysit-pr (cloud session or no \`gh\`), so call \`subscribe_pr_activity\` with { owner: "${pr.owner}", repo: "${pr.repo}", pullNumber: ${pr.number} } and handle each PR event with the ce-babysit-pr rules: review feedback before CI, fix and push, then report a looks-ready status line. Do not poll or sleep; end the turn and let events wake you. ${never}`;
}

export function run(raw, env = process.env) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return ''; }
  if (!isPrCreate(payload)) return '';
  const pr = findPr(payload.tool_response);
  if (!pr) return '';
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: instruction(pr, env) },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const out = run(readFileSync(0, 'utf8'));
    if (out) process.stdout.write(out);
  } catch { /* silent by design */ }
  process.exit(0);
}
