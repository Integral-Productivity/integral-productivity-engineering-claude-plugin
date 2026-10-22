import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WRAPPER = fileURLToPath(new URL('./babysit-pr.sh', import.meta.url));
const PR_URL = 'https://github.com/Integral-Productivity/example-repo/pull/42';

// A bin dir holding a fake `gh`, plus the real node and cat, so tests control
// whether gh is on PATH without depending on the host.
function binDir({ gh = true, node = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'babysit-bin-'));
  if (gh) {
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'gh'), 0o755);
  }
  if (node) symlinkSync(process.execPath, join(dir, 'node'));
  const cat = spawnSync('sh', ['-c', 'command -v cat']).stdout.toString().trim();
  symlinkSync(cat, join(dir, 'cat'));
  return dir;
}

function run(input, { env = {}, gh = true, node = true } = {}) {
  const bin = binDir({ gh, node });
  try {
    const res = spawnSync('/bin/sh', [WRAPPER], {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      env: { PATH: bin, CLAUDE_PLUGIN_ROOT: dirname(dirname(WRAPPER)), ...env },
    });
    const stdout = res.stdout.toString();
    return { status: res.status, stdout, stderr: res.stderr.toString(), json: stdout ? JSON.parse(stdout) : null };
  } finally { rmSync(bin, { recursive: true, force: true }); }
}

const ghCreate = (stdout) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'git push -u origin claude/x && gh pr create --fill --base main' },
  tool_response: { stdout, stderr: '', interrupted: false },
});

const mcpCreate = (name, text) => ({
  hook_event_name: 'PostToolUse',
  tool_name: name,
  tool_input: { owner: 'Integral-Productivity', repo: 'example-repo', title: 't', head: 'h', base: 'main' },
  tool_response: [{ type: 'text', text }],
});

const context = (r) => r.json?.hookSpecificOutput?.additionalContext ?? '';

test('gh pr create in a local session with gh: tells the agent to run ce-babysit-pr', () => {
  const r = run(ghCreate(`Creating pull request...\n${PR_URL}\n`));
  assert.equal(r.status, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(context(r), /\/compound-engineering:ce-babysit-pr https:\/\/github\.com\/Integral-Productivity\/example-repo\/pull\/42/);
  assert.match(context(r), /posture `?target`?/);
  assert.match(context(r), /[Nn]ever merge/);
  assert.doesNotMatch(context(r), /subscribe_pr_activity/);
});

test('cloud session: tells the agent to subscribe_pr_activity with owner, repo and number', () => {
  const r = run(ghCreate(`${PR_URL}\n`), { env: { CLAUDE_CODE_REMOTE: 'true' } });
  assert.equal(r.status, 0);
  assert.match(context(r), /subscribe_pr_activity/);
  assert.match(context(r), /owner: "Integral-Productivity", repo: "example-repo", pullNumber: 42/);
  assert.match(context(r), /[Nn]ever merge/);
  assert.doesNotMatch(context(r), /run `\/compound-engineering:ce-babysit-pr/);
});

test('local session without gh on PATH: falls back to subscribe_pr_activity', () => {
  const r = run(ghCreate(`${PR_URL}\n`), { gh: false });
  assert.match(context(r), /subscribe_pr_activity/);
});

test('GitHub MCP create_pull_request: reads the URL from the JSON text block', () => {
  const text = JSON.stringify({ id: 1, url: PR_URL, number: 42 });
  for (const name of ['mcp__github__create_pull_request', 'mcp__GitHub_Extended__create_pull_request', 'mcp__plugin_engineering_github__create_pull_request']) {
    const r = run(mcpCreate(name, text));
    assert.equal(r.status, 0, name);
    assert.match(context(r), /example-repo\/pull\/42/, name);
  }
});

test('a GitHub Enterprise host is read too', () => {
  const r = run(ghCreate('https://ghe.example.com/acme/widgets/pull/7\n'), { env: { CLAUDE_CODE_REMOTE: 'true' } });
  assert.match(context(r), /owner: "acme", repo: "widgets", pullNumber: 7/);
});

const silent = (r, label) => {
  assert.equal(r.status, 0, label);
  assert.equal(r.stdout, '', label);
  assert.equal(r.stderr, '', label);
};

test('silent: an ordinary Bash call', () => {
  silent(run({ tool_name: 'Bash', tool_input: { command: 'ls -la' }, tool_response: { stdout: PR_URL } }));
});

test('silent: gh pr view / gh pr list are not pr create', () => {
  silent(run({ tool_name: 'Bash', tool_input: { command: 'gh pr view 42' }, tool_response: { stdout: PR_URL } }));
});

test('silent: gh pr create that failed and printed no URL', () => {
  silent(run(ghCreate('a pull request for branch "x" already exists\n')));
});

test('silent: create_pull_request_with_copilot does not open a PR itself', () => {
  silent(run(mcpCreate('mcp__github__create_pull_request_with_copilot', JSON.stringify({ url: PR_URL }))));
});

test('silent: malformed JSON on stdin', () => {
  silent(run('{"tool_name": "Bash", "gh pr create'));
});

test('silent: empty stdin', () => {
  silent(run(''));
});

test('silent: opt-out env var', () => {
  for (const v of ['off', '0', 'false']) silent(run(ghCreate(`${PR_URL}\n`), { env: { IPE_BABYSIT_PR_HOOK: v } }), v);
});

test('silent: node missing from PATH', () => {
  silent(run(ghCreate(`${PR_URL}\n`), { node: false }));
});
