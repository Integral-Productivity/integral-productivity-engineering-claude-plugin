// Fitness checks for the residual rule (issue #208): one reference file, the
// six ordered questions, and a citation from every role that applies it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const RULE = 'skills/writing-dispatch-prompts/reference/residual-rule.md';
const read = (path) => readFileSync(REPO + path, 'utf8');

test('Given the plugin, then the residual rule exists as one reference file', () => {
  assert.ok(existsSync(REPO + RULE), `${RULE} exists`);
});

test('Given the residual rule, then it asks six numbered questions in order, stopping at the first yes', () => {
  const text = read(RULE);
  const questions = [...text.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gm)].map((m) => [Number(m[1]), m[2].toLowerCase()]);
  assert.deepEqual(questions.map(([n]) => n), [1, 2, 3, 4, 5, 6], 'questions numbered 1 to 6');
  const keys = ['wrong, unsafe or not done', 'introduced by the fix', 'same defect class', 'cheap and reversible', 'maintainer', 'file'];
  keys.forEach((key, i) => assert.ok(questions[i][1].includes(key), `question ${i + 1} is about "${key}", got "${questions[i][1]}"`));
  assert.match(text, /first yes/i, 'the rule says to stop at the first yes');
});

test('Given the residual rule, then a residual is defined as real, outside the defect class, and not blocking Done-when', () => {
  const text = read(RULE);
  assert.match(text, /evidence/i);
  assert.match(text, /outside the defect class/i);
  assert.match(text, /Done-when/);
});

test('Given the residual rule, then process reasons never qualify a gap for filing', () => {
  const text = read(RULE);
  assert.match(text, /process reasons?/i);
  assert.match(text, /the verifier passed/);
  assert.match(text, /the PR is large/);
});

test('Given the fixer and verifier profiles, then each cites the residual rule', () => {
  for (const profile of ['agents/fixer.md', 'agents/verifier.md']) {
    assert.ok(read(profile).includes('reference/residual-rule.md'), `${profile} cites reference/residual-rule.md`);
  }
});

test('Given the lead guidance, then writing-dispatch-prompts lists the residual rule among its references', () => {
  assert.match(read('skills/writing-dispatch-prompts/SKILL.md'), /\[`reference\/residual-rule\.md`\]\(reference\/residual-rule\.md\)/);
});
