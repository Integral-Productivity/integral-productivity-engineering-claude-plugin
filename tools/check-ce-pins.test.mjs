import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PINS, checkPins, findInstalledSkillsDir, registeredInstalls } from './check-ce-pins.mjs';

const SCRIPT = fileURLToPath(new URL('./check-ce-pins.mjs', import.meta.url));

function fixture(pins, omit = new Set()) {
  const dir = mkdtempSync(join(tmpdir(), 'ce-pins-'));
  const byFile = new Map();
  for (const pin of pins) {
    if (omit.has(pin.id)) continue;
    byFile.set(pin.file, (byFile.get(pin.file) ?? '') + `prefix ${pin.text} suffix\n`);
  }
  for (const pin of pins) if (!byFile.has(pin.file)) byFile.set(pin.file, 'unrelated\n');
  for (const [file, body] of byFile) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), body);
  }
  return dir;
}

test('every pin found: no missing pins', () => {
  const dir = fixture(PINS);
  try {
    const result = checkPins(dir);
    assert.deepEqual(result.missing, []);
    assert.equal(result.checked, PINS.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a renamed key is reported as missing, by id', () => {
  const dir = fixture(PINS, new Set(['work-engine-mode-values']));
  try {
    const ids = checkPins(dir).missing.map((m) => m.id);
    assert.deepEqual(ids, ['work-engine-mode-values']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a missing source file is reported as missing, not thrown', () => {
  const dir = fixture(PINS);
  rmSync(join(dir, 'ce-work', 'SKILL.md'));
  try {
    const missing = checkPins(dir).missing;
    assert.ok(missing.some((m) => m.id === 'implementation-engine-carrier' && m.reason === 'file not found'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every pin names a file, a non-empty text and the profile rule it backs', () => {
  for (const pin of PINS) {
    assert.ok(pin.id && pin.file && pin.text && pin.backs, JSON.stringify(pin));
  }
  assert.equal(new Set(PINS.map((p) => p.id)).size, PINS.length);
});

test('findInstalledSkillsDir picks the highest semantic version that has skills/', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce-cache-'));
  try {
    for (const v of ['3.9.0', '3.30.4', '3.30.10']) mkdirSync(join(root, v, 'skills'), { recursive: true });
    mkdirSync(join(root, 'not-a-version', 'skills'), { recursive: true });
    mkdirSync(join(root, '3.99.0'));
    assert.equal(findInstalledSkillsDir(root), join(root, '3.30.10', 'skills'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('findInstalledSkillsDir returns null when nothing is installed', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce-cache-'));
  try {
    assert.equal(findInstalledSkillsDir(root), null);
    assert.equal(findInstalledSkillsDir(join(root, 'absent')), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI exits 0 when all pins hold, 1 when one is missing, 2 when no install is found', () => {
  const good = fixture(PINS);
  const bad = fixture(PINS, new Set(['cross-model-review-mode-off']));
  const empty = mkdtempSync(join(tmpdir(), 'ce-cache-'));
  try {
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--skills-dir', good]).status, 0);
    const failed = spawnSync(process.execPath, [SCRIPT, '--skills-dir', bad], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stdout + failed.stderr, /cross-model-review-mode-off/);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--registry', join(empty, 'absent.json'), '--cache-root', empty]).status, 2);
  } finally {
    for (const d of [good, bad, empty]) rmSync(d, { recursive: true, force: true });
  }
});

const KEY = 'compound-engineering@compound-engineering-plugin';

function registry(dir, entries) {
  const path = join(dir, 'installed_plugins.json');
  writeFileSync(path, JSON.stringify({ version: 2, plugins: { [KEY]: entries, 'other@x': [{ installPath: '/nope' }] } }));
  return path;
}

test('registeredInstalls returns each distinct registered install with its projects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-reg-'));
  try {
    const path = registry(dir, [
      { scope: 'project', projectPath: '/a', installPath: '/ce/3.30.4', version: '3.30.4' },
      { scope: 'project', projectPath: '/b', installPath: '/ce/3.30.4', version: '3.30.4' },
      { scope: 'project', projectPath: '/c', installPath: '/ce/3.30.1', version: '3.30.1' },
      { scope: 'user', installPath: '/ce/3.29.0', version: '3.29.0' },
    ]);
    const all = registeredInstalls(path);
    assert.deepEqual(all.map((i) => i.installPath).sort(), ['/ce/3.29.0', '/ce/3.30.1', '/ce/3.30.4']);
    assert.deepEqual(all.find((i) => i.installPath === '/ce/3.30.4').projects, ['/a', '/b']);
    const forC = registeredInstalls(path, { project: '/c' });
    assert.deepEqual(forC.map((i) => i.installPath).sort(), ['/ce/3.29.0', '/ce/3.30.1']);
    assert.equal(registeredInstalls(join(dir, 'absent.json')), null);
    writeFileSync(join(dir, 'odd.json'), JSON.stringify({ plugins: { [KEY]: {} } }));
    assert.equal(registeredInstalls(join(dir, 'odd.json')), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI checks every registered install and fails when any one misses a pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-reg-'));
  const good = fixture(PINS);
  const bad = fixture(PINS, new Set(['work-engine-mode-values']));
  try {
    const goodInstall = join(dir, 'good');
    const badInstall = join(dir, 'bad');
    mkdirSync(goodInstall); mkdirSync(badInstall);
    symlinkSync(good, join(goodInstall, 'skills'));
    symlinkSync(bad, join(badInstall, 'skills'));
    const onlyGood = registry(dir, [{ scope: 'user', installPath: goodInstall, version: '1' }]);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--registry', onlyGood]).status, 0);
    const both = registry(dir, [
      { scope: 'user', installPath: goodInstall, version: '1' },
      { scope: 'project', projectPath: '/p', installPath: badInstall, version: '2' },
    ]);
    const r = spawnSync(process.execPath, [SCRIPT, '--registry', both], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /work-engine-mode-values/);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--registry', both, '--project', '/elsewhere']).status, 2);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--registry', both, '--project', '/p/']).status, 1);
    const missing = registry(dir, [{ scope: 'user', installPath: join(dir, 'gone'), version: '3' }]);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--registry', missing]).status, 1);
  } finally {
    for (const d of [dir, good, bad]) rmSync(d, { recursive: true, force: true });
  }
});

test('CLI falls back to the newest cached install only with an explicit notice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-reg-'));
  const cache = mkdtempSync(join(tmpdir(), 'ce-cache-'));
  const src = fixture(PINS);
  try {
    mkdirSync(join(cache, '3.30.4'));
    symlinkSync(src, join(cache, '3.30.4', 'skills'));
    const r = spawnSync(process.execPath, [SCRIPT, '--registry', join(dir, 'absent.json'), '--cache-root', cache], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout + r.stderr, /NOTICE/);
  } finally {
    for (const d of [dir, cache, src]) rmSync(d, { recursive: true, force: true });
  }
});

test('CLI accepts --skills-dir=<path> and rejects a missing value or unknown flag with exit 2', () => {
  const good = fixture(PINS);
  try {
    assert.equal(spawnSync(process.execPath, [SCRIPT, `--skills-dir=${good}`]).status, 0);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--skills-dir']).status, 2);
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--skills-dri', good]).status, 2);
  } finally { rmSync(good, { recursive: true, force: true }); }
});

test('CLI invoked through a symlinked script still runs and fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-link-'));
  try {
    const link = join(dir, 'check-ce-pins.mjs');
    symlinkSync(SCRIPT, link);
    const r = spawnSync(process.execPath, [link, '--skills-dir', join(dir, 'nonexistent')]);
    assert.equal(r.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('registeredInstalls matches --project after normalizing trailing slashes, relative and symlinked paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-reg-'));
  try {
    const project = join(dir, 'proj');
    mkdirSync(project);
    const link = join(dir, 'proj-link');
    symlinkSync(project, link);
    const path = registry(dir, [
      { scope: 'project', projectPath: project, installPath: '/ce/3.30.1', version: '3.30.1' },
      { scope: 'user', installPath: '/ce/3.30.4', version: '3.30.4' },
    ]);
    const expected = ['/ce/3.30.1', '/ce/3.30.4'];
    for (const form of [project, `${project}/`, link, relative(process.cwd(), project)]) {
      assert.deepEqual(registeredInstalls(path, { project: form }).map((i) => i.installPath).sort(), expected, form);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI exits 2 when the registry lists no CE install at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-reg-'));
  try {
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--registry', registry(dir, [])]).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI fallback exits 1 when the newest cached install misses a pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ce-reg-'));
  const cache = mkdtempSync(join(tmpdir(), 'ce-cache-'));
  const src = fixture(PINS, new Set(['coverage-depth']));
  try {
    mkdirSync(join(cache, '3.30.4'));
    symlinkSync(src, join(cache, '3.30.4', 'skills'));
    const r = spawnSync(process.execPath, [SCRIPT, '--registry', join(dir, 'absent.json'), '--cache-root', cache], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /NOTICE/);
    assert.match(r.stdout, /coverage-depth/);
  } finally {
    for (const d of [dir, cache, src]) rmSync(d, { recursive: true, force: true });
  }
});
