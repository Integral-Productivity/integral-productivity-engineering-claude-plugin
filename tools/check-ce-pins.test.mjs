import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PINS, checkPins, findInstalledSkillsDir } from './check-ce-pins.mjs';

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

test('findInstalledSkillsDir picks the highest semantic version, not the lexical one', () => {
  const root = mkdtempSync(join(tmpdir(), 'ce-cache-'));
  try {
    for (const v of ['3.9.0', '3.30.4', '3.30.10']) mkdirSync(join(root, v, 'skills'), { recursive: true });
    mkdirSync(join(root, 'not-a-version'));
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
    assert.equal(spawnSync(process.execPath, [SCRIPT, '--cache-root', empty]).status, 2);
  } finally {
    for (const d of [good, bad, empty]) rmSync(d, { recursive: true, force: true });
  }
});
