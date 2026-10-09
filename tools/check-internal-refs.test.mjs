import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanText, scanFiles, loadConfig } from './check-internal-refs.mjs';

const SCRIPT = fileURLToPath(new URL('./check-internal-refs.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('..', import.meta.url));

// Fixture names are fictitious and assembled at runtime, so this file never
// names a real repo and does not trip the lint it tests.
const ORG = ['Integral', 'Productivity'].join('-');
const FAKE = ['example', 'private', 'tool'].join('-');
const SUFFIX = ['', 'claude', 'plugin'].join('-');
const FAKE_PLUGIN = `${FAKE}${SUFFIX}`;
const OTHER = `other-team${SUFFIX}`;
const OPEN = `open${SUFFIX}`;
const HASH = '#'; // keeps name#N fixtures from reading as references in this file

const CONFIG = {
  org: ORG,
  publicRepos: ['open-thing', OPEN, 'Mixed-Case-Thing'],
  exclude: [],
};

const rules = (text, config = CONFIG) => scanText(text, config).map((f) => `${f.rule}:${f.token}`);

test('rule org-repo: an org/repo reference to a non-public repo is a finding', () => {
  assert.deepEqual(rules(`see ${ORG}/secret-sauce for details`), ['org-repo:secret-sauce']);
  assert.deepEqual(rules(`https://github.com/${ORG}/secret-sauce/issues/90003.`), ['org-repo:secret-sauce']);
});

test('rule org-repo: the org prefix matches in any case', () => {
  assert.deepEqual(rules(`${ORG.toLowerCase()}/${FAKE}`), [`org-repo:${FAKE}`]);
  assert.deepEqual(rules(`https://github.com/${ORG.toUpperCase()}/${FAKE}/pull/90005`), [`org-repo:${FAKE}`]);
});

test('rule org-repo: trailing dots are trimmed from the repo name', () => {
  // Without the trim, "open-thing." is not on the allowlist and would be a finding.
  assert.deepEqual(rules(`${ORG}/open-thing.`), []);
  assert.deepEqual(rules(`${ORG}/open-thing...`), []);
  assert.deepEqual(rules(`see ${ORG}/${FAKE}.`), [`org-repo:${FAKE}`]);
});

test('rule org-repo: an @<org>/<name> npm scope is checked like any org reference', () => {
  assert.deepEqual(rules(`npm install @${ORG.toLowerCase()}/${FAKE}`), [`org-repo:${FAKE}`]);
  assert.deepEqual(rules(`"@${ORG.toLowerCase()}/open-thing": "^1.0.0"`), []);
  // a placeholder with literal angle brackets names nothing
  assert.deepEqual(rules(`npm install @${ORG.toLowerCase()}/<pkg>`), []);
});

test('rule org-repo: a mixed-case publicRepos entry matches any case in the text', () => {
  assert.deepEqual(rules(`${ORG}/Mixed-Case-Thing`), []);
  assert.deepEqual(rules(`${ORG}/mixed-case-thing`), []);
});

test('rule org-repo: a repo name starting with a dot is a finding', () => {
  assert.deepEqual(rules(`${ORG}/.secret-thing`), ['org-repo:.secret-thing']);
});

test('rule org-repo: a public repo, in any case, passes', () => {
  assert.deepEqual(rules(`https://github.com/${ORG}/Open-Thing/issues/90003`), []);
  assert.deepEqual(rules(`${ORG.toLowerCase()}/open-thing.`), []);
});

test('rule org-repo: a trailing .git is not part of the repo name', () => {
  assert.deepEqual(rules(`git clone https://github.com/${ORG}/open-thing.git`), []);
  assert.deepEqual(rules(`git@github.com:${ORG}/Open-Thing.git`), []);
  assert.deepEqual(rules(`git clone ${ORG}/secret-sauce.git`), ['org-repo:secret-sauce']);
});

test('rule plugin-name: a *-claude-plugin name that is not public is a finding', () => {
  assert.deepEqual(rules(`lives in the ${OTHER} repo`), [`plugin-name:${OTHER}`]);
  assert.deepEqual(rules(`lives in ${OPEN}`), []);
  assert.deepEqual(rules(`lives in ${OPEN.toUpperCase()}`), []);
});

test('rule plugin-name: a -claude-plugin followed by more name characters is not a plugin name', () => {
  // e.g. a file named ADR-030-claude-plugin-repo-naming-convention.md
  assert.deepEqual(rules(`see ADR-030${SUFFIX}-repo-naming-convention.md`), []);
  assert.deepEqual(rules(`the ${OTHER}.`), [`plugin-name:${OTHER}`]);
  assert.deepEqual(rules(`(${OTHER})`), [`plugin-name:${OTHER}`]);
});

test('rule cross-repo-issue: a trailing dot before #N is trimmed from the name', () => {
  assert.deepEqual(rules(`open-thing.${HASH}90006`), []);
  assert.deepEqual(rules(`${FAKE}.${HASH}90006`), [`cross-repo-issue:${FAKE}`]);
});

test('rule cross-repo-issue: one-word <word>#N passes (a documented limit)', () => {
  assert.deepEqual(rules(`see PR${HASH}90007 and issue${HASH}90008`), []);
});

test('rule cross-repo-issue: name#N shorthand for a non-public repo is a finding', () => {
  assert.deepEqual(rules(`fixed in some-repo${HASH}90004`), ['cross-repo-issue:some-repo']);
  assert.deepEqual(rules(`fixed in open-thing${HASH}90004 and in #90004 and issue #90004`), []);
});

test('one reference that several rules see is reported once per rule, not per match', () => {
  const found = rules(`${FAKE_PLUGIN}${HASH}90001 and ${FAKE_PLUGIN}${HASH}90002 on one line`);
  assert.deepEqual(found.sort(), [
    `cross-repo-issue:${FAKE_PLUGIN}`,
    `plugin-name:${FAKE_PLUGIN}`,
  ]);
});

test('ordinary prose, issue numbers in this repo, and CE skill names pass', () => {
  assert.deepEqual(rules('a sibling internal plugin; see #97, compound-engineering:ce-work and mode:return-to-caller'), []);
});

function runCli(args, input) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', input });
}

test('CLI: the checked-in tree is clean (exit 0)', () => {
  const r = runCli([]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('CLI: a fixture naming an internal repo fails (exit 1) with file:line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'internal-refs-'));
  try {
    const file = join(dir, 'fixture.md');
    writeFileSync(file, `line one\nOn ${FAKE_PLUGIN}${HASH}90001, a guard failed.\n`);
    const cfg = join(dir, 'config.json');
    writeFileSync(cfg, JSON.stringify(CONFIG));
    const r = runCli(['--config', cfg, file]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /fixture\.md:2: plugin-name/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: the checked-in config fails closed on names it has never seen', () => {
  // Fictitious names only: neither is in publicRepos, so both must be findings
  // without the config having to list them.
  const dir = mkdtempSync(join(tmpdir(), 'internal-refs-'));
  try {
    const file = join(dir, 'unknown.md');
    writeFileSync(file, `See ${ORG}/never-a-real-repo and the ${OTHER} for details.\n`);
    const r = runCli([file]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /unknown\.md:1: org-repo: never-a-real-repo/);
    assert.match(r.stdout, new RegExp(`unknown\\.md:1: plugin-name: ${OTHER}`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('config: every exclusion carries a reason', () => {
  const config = loadConfig(join(REPO, 'tools', 'internal-refs.config.json'));
  for (const e of config.exclude) assert.ok(e.path && e.reason, JSON.stringify(e));
});

test('CLI: an unknown flag exits 2 without checking anything', () => {
  for (const flag of ['--hash', '--no-such-flag']) {
    const r = runCli([flag]);
    assert.equal(r.status, 2, `${flag}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '');
  }
});

test('config: the checked-in config stores no internal names in any form', () => {
  const config = loadConfig(join(REPO, 'tools', 'internal-refs.config.json'));
  assert.deepEqual(Object.keys(config).sort(), ['$comment', 'exclude', 'org', 'publicRepos']);
  assert.ok(!/\b[0-9a-f]{40,}\b/.test(JSON.stringify(config)), 'no digest-shaped strings');
});

test('scanFiles: a binary file (NUL byte) is skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'internal-refs-'));
  try {
    writeFileSync(join(dir, 'blob.bin'), Buffer.concat([Buffer.from(`${ORG}/secret-sauce `), Buffer.from([0])]));
    writeFileSync(join(dir, 'text.md'), `${ORG}/secret-sauce\n`);
    const found = scanFiles(['blob.bin', 'text.md'], CONFIG, dir).map((f) => f.file);
    assert.deepEqual(found, ['text.md']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('config: a config missing a required key is rejected, and the CLI exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'internal-refs-'));
  try {
    const file = join(dir, 'any.md');
    writeFileSync(file, 'plain text\n');
    for (const key of ['publicRepos', 'org', 'exclude']) {
      const partial = { ...CONFIG };
      delete partial[key];
      const cfg = join(dir, `config-${key}.json`);
      writeFileSync(cfg, JSON.stringify(partial));
      assert.throws(() => loadConfig(cfg), /config needs/, key);
      const r = runCli(['--config', cfg, file]);
      assert.equal(r.status, 2, `${key}: ${r.stdout}${r.stderr}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: a file argument that does not exist exits 2', () => {
  const r = runCli(['/nonexistent/fixture.md']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /no such file/);
});

test('CLI: an unreadable config exits 2', () => {
  const r = runCli(['--config', '/nonexistent/config.json']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
});
