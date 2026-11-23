// BDD scenarios for workflows/root-cause-gate.js (issue #208), run in a stub
// harness like tools/fix-queue.test.mjs: fake agent(), parallel(), phase() and
// log(); no real agents, no git, no gh. ROOT_CAUSE_GATE_SCRIPT points them at
// another copy (mutation checks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCRIPT = process.env.ROOT_CAUSE_GATE_SCRIPT || fileURLToPath(new URL('../workflows/root-cause-gate.js', import.meta.url));
const SKILL = fileURLToPath(new URL('../skills/root-cause-gate-guide/SKILL.md', import.meta.url));
const load = () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const body = src.replace(/^export const meta = /m, 'const meta = ');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return { src, run: new AsyncFunction('agent', 'pipeline', 'parallel', 'phase', 'log', 'args', 'budget', 'workflow', body) };
};

const ALL_LENSES = ['requirements', 'architecture', 'design', 'quality', 'business', 'engineering', 'process'];
const CORE_LENSES = ['requirements', 'design', 'quality'];
const NO_FLAGS = { contract: false, adr: false, hook: false, unattended: false };

// A world describes what each stub agent returns. Labels the gate uses:
// 'reproduce #<n>', 'lens <name> #<n>', 'inventory', 'plan'.
async function gate(world, args = {}) {
  const { run } = load();
  const calls = []; const logs = [];
  const agent = async (prompt, opts) => {
    calls.push({ label: opts.label, prompt });
    const [kind, a, b] = opts.label.split(' ');
    if (kind === 'reproduce') return world.reproduce(Number(a.slice(1)), prompt);
    if (kind === 'lens') return world.lens(a, Number(b.slice(1)), prompt);
    if (kind === 'inventory') return world.inventory(prompt);
    if (kind === 'plan') return world.plan(prompt);
    throw new Error(`unexpected agent ${opts.label}`);
  };
  const parallel = async (thunks) => Promise.all(thunks.map(async (t) => { try { return await t() } catch { return null } }));
  const report = await run(agent, null, parallel, () => {}, (l) => logs.push(l), { repo: 'O/r', repoPath: '/repo', scratch: '/scratch', ...args }, null, null);
  return { report, calls, logs, lensCalls: (n) => calls.filter((c) => c.label.startsWith('lens ') && c.label.endsWith(`#${n}`)) };
}

const reproduces = (flags = NO_FLAGS) => () => ({ reproduces: true, evidence: 'fails on main', acceptance: 'as written', touches: flags });
const lensNames = (cls) => (name, n) => ({ rootCauses: [`${name} cause for #${n}`], defectClass: cls(n), evidence: ['src/a.js:10'] });
const planFor = () => (prompt) => {
  const ids = [...prompt.matchAll(/^- class (\S+): plan file (\S+)/gm)].map((m) => ({ classId: m[1], planFile: m[2] }));
  return { plans: ids.map(({ classId, planFile }) => ({ classId, planFile, testTier: 'unit', testFile: `test/${classId}.test.js`, failingTest: 'pins the class' })) };
};

test('Given an issue that names one file, when the inventory finds the defect class in two more files, then its scope fence names all three and the test file', async () => {
  const world = {
    reproduce: reproduces(),
    lens: lensNames(() => 'asks a person a question where no person exists'),
    inventory: () => ({ classes: [{ id: 'no-person-prompt', description: 'asks a person a question where no person exists', issues: [7], sites: [{ file: 'src/a.js', line: 10 }, { file: 'skills/b/SKILL.md', line: 3 }, { file: 'hooks/c.sh', line: 40 }], claims: [], matrix: '' }] }),
    plan: planFor(),
  };
  const { report } = await gate(world, { issues: [7] });
  const fence = report.scopeFence['7'];
  for (const file of ['src/a.js', 'skills/b/SKILL.md', 'hooks/c.sh', 'test/no-person-prompt.test.js']) assert.ok(fence.includes(file), `fence names ${file}`);
  assert.deepEqual(report.fixQueueArgs.issues, [7]);
  assert.deepEqual(report.fixQueueArgs.scopeFence, report.scopeFence);
  assert.equal(report.fixQueueArgs.repo, 'O/r');
  assert.equal(report.fixQueueArgs.repoPath, '/repo');
  assert.ok(report.planFiles['7'].startsWith('/scratch/'), 'plan file is under scratch');
  const item = report.reproduced.find((r) => r.number === 7);
  assert.equal(item.defectClass, 'no-person-prompt');
  assert.equal(item.testTier, 'unit');
});

test('Given an issue that no longer reproduces on main, when the gate runs, then it reports it with re-baselined acceptance criteria, runs no lens for it, and gives it no fence', async () => {
  const world = {
    reproduce: (n) => n === 8
      ? { reproduces: false, evidence: 'passes on main since abc123', acceptance: 'only the error message wording remains', touches: NO_FLAGS }
      : reproduces()(),
    lens: lensNames(() => 'class-x'),
    inventory: () => ({ classes: [{ id: 'class-x', description: 'x', issues: [9], sites: [{ file: 'src/x.js', line: 1 }], claims: [], matrix: '' }] }),
    plan: planFor(),
  };
  const { report, lensCalls } = await gate(world, { issues: [8, 9] });
  const gone = report.notReproduced.find((r) => r.number === 8);
  assert.ok(gone, '#8 is in notReproduced');
  assert.equal(gone.acceptance, 'only the error message wording remains');
  assert.equal(gone.evidence, 'passes on main since abc123');
  assert.equal(lensCalls(8).length, 0, 'no lens ran for #8');
  assert.equal(report.scopeFence['8'], undefined);
  assert.deepEqual(report.fixQueueArgs.issues, [9]);
});

test('Given every issue no longer reproduces, when the gate runs, then no inventory or plan agent runs and fix-queue gets no issues', async () => {
  const world = { reproduce: () => ({ reproduces: false, evidence: 'gone', acceptance: 'none left', touches: NO_FLAGS }), lens: () => assert.fail('no lens'), inventory: () => assert.fail('no inventory'), plan: () => assert.fail('no plan') };
  const { report, calls } = await gate(world, { issues: [3] });
  assert.deepEqual(calls.map((c) => c.label), ['reproduce #3']);
  assert.deepEqual(report.fixQueueArgs.issues, []);
  assert.deepEqual(report.scopeFence, {});
});

for (const flag of ['contract', 'adr', 'hook', 'unattended']) {
  test(`Given an issue that touches ${flag === 'adr' ? 'an ADR' : flag === 'unattended' ? 'unattended use' : `a ${flag}`}, when the gate runs, then all seven lenses review it`, async () => {
    const world = { reproduce: reproduces({ ...NO_FLAGS, [flag]: true }), lens: lensNames(() => 'c'), inventory: () => ({ classes: [{ id: 'c', description: 'c', issues: [5], sites: [], claims: [], matrix: '' }] }), plan: planFor() };
    const { lensCalls, report } = await gate(world, { issues: [5] });
    assert.deepEqual(lensCalls(5).map((c) => c.label.split(' ')[1]).sort(), [...ALL_LENSES].sort());
    assert.deepEqual(report.reproduced[0].lenses.slice().sort(), [...ALL_LENSES].sort());
  });
}

test('Given an issue that touches none of contract, ADR, hook or unattended use, when the gate runs, then only the requirements, design and quality lenses review it', async () => {
  const world = { reproduce: reproduces(), lens: lensNames(() => 'c'), inventory: () => ({ classes: [{ id: 'c', description: 'c', issues: [5], sites: [], claims: [], matrix: '' }] }), plan: planFor() };
  const { lensCalls } = await gate(world, { issues: [5] });
  assert.deepEqual(lensCalls(5).map((c) => c.label.split(' ')[1]).sort(), [...CORE_LENSES].sort());
});

test('Given lenses "all", when an issue touches nothing, then all seven lenses still review it', async () => {
  const world = { reproduce: reproduces(), lens: lensNames(() => 'c'), inventory: () => ({ classes: [{ id: 'c', description: 'c', issues: [5], sites: [], claims: [], matrix: '' }] }), plan: planFor() };
  const { lensCalls } = await gate(world, { issues: [5], lenses: 'all' });
  assert.equal(lensCalls(5).length, 7);
});

test('Given the lens reviewers, then each prompt names only its own lens, the issue numbers and the repo path, and no other reviewer output', async () => {
  const world = { reproduce: reproduces(), lens: lensNames(() => 'SECRET-CLASS-TEXT'), inventory: () => ({ classes: [{ id: 'c', description: 'c', issues: [5, 6], sites: [], claims: [], matrix: '' }] }), plan: planFor() };
  const { calls } = await gate(world, { issues: [5, 6] });
  const lensPrompts = calls.filter((c) => c.label.startsWith('lens '));
  assert.equal(lensPrompts.length, 6);
  for (const { label, prompt } of lensPrompts) {
    const own = label.split(' ')[1];
    assert.ok(prompt.includes('/repo'), 'names the repo path');
    assert.ok(prompt.includes('#5') && prompt.includes('#6'), 'names the issue numbers');
    assert.ok(!prompt.includes('SECRET-CLASS-TEXT'), 'carries no other reviewer output');
    assert.ok(!prompt.includes('fails on main'), 'carries no reproduction output');
    for (const other of ALL_LENSES.filter((l) => l !== own)) assert.ok(!new RegExp(`\\b${other} lens\\b`).test(prompt), `does not name the ${other} lens`);
  }
});

test('Given two issues the inventory puts in one defect class, then both get the same fence and the same plan file', async () => {
  const world = { reproduce: reproduces(), lens: lensNames(() => 'shared'), inventory: () => ({ classes: [{ id: 'shared', description: 's', issues: [1, 2], sites: [{ file: 'a.js', line: 1 }, { file: 'b.js', line: 2 }], claims: [], matrix: '' }] }), plan: planFor() };
  const { report } = await gate(world, { issues: [1, 2] });
  assert.equal(report.scopeFence['1'], report.scopeFence['2']);
  assert.equal(report.planFiles['1'], report.planFiles['2']);
});

test('Given two defect classes, then each issue fence holds only its own class files', async () => {
  const world = {
    reproduce: reproduces(), lens: lensNames((n) => `class-${n}`),
    inventory: () => ({ classes: [
      { id: 'one', description: '1', issues: [1], sites: [{ file: 'only-one.js', line: 1 }], claims: [], matrix: '' },
      { id: 'two', description: '2', issues: [2], sites: [{ file: 'only-two.js', line: 1 }], claims: [], matrix: '' },
    ] }),
    plan: planFor(),
  };
  const { report } = await gate(world, { issues: [1, 2] });
  assert.ok(report.scopeFence['1'].includes('only-one.js') && !report.scopeFence['1'].includes('only-two.js'));
  assert.ok(report.scopeFence['2'].includes('only-two.js') && !report.scopeFence['2'].includes('only-one.js'));
  assert.notEqual(report.planFiles['1'], report.planFiles['2']);
});

test('Given a reproducing issue the inventory puts in no class, then it is reported unclassified and gets no fence', async () => {
  const world = { reproduce: reproduces(), lens: lensNames(() => 'c'), inventory: () => ({ classes: [{ id: 'c', description: 'c', issues: [1], sites: [{ file: 'a.js', line: 1 }], claims: [], matrix: '' }] }), plan: planFor() };
  const { report } = await gate(world, { issues: [1, 2] });
  assert.deepEqual(report.unclassified.map((u) => u.number), [2]);
  assert.equal(report.scopeFence['2'], undefined);
  assert.deepEqual(report.fixQueueArgs.issues, [1]);
});

test('Given the inventory and plan prompts, then they tell agents to take test tiers and matrices from the target repo and cite the residual rule', async () => {
  const world = { reproduce: reproduces(), lens: lensNames(() => 'c'), inventory: () => ({ classes: [{ id: 'c', description: 'c', issues: [1], sites: [], claims: [], matrix: '' }] }), plan: planFor() };
  const { calls } = await gate(world, { issues: [1] });
  const inv = calls.find((c) => c.label === 'inventory').prompt;
  const plan = calls.find((c) => c.label === 'plan').prompt;
  assert.match(inv, /CLAUDE\.md/); assert.match(inv, /docs\/agents\//);
  assert.match(plan, /CLAUDE\.md/); assert.match(plan, /docs\/agents\//);
  assert.match(plan, /residual-rule\.md/);
  assert.match(plan, /failing test/i);
});

for (const [name, args, pattern] of [
  ['a missing repo', { repo: undefined, issues: [1] }, /args\.repo/],
  ['a repo path with ..', { repoPath: '/repo/../etc', issues: [1] }, /args\.repoPath/],
  ['a relative scratch', { scratch: 'scratch', issues: [1] }, /args\.scratch/],
  ['no issues', { issues: [] }, /args\.issues/],
  ['a non-integer issue', { issues: ['7'] }, /args\.issues/],
  ['an unknown lenses value', { issues: [1], lenses: 'some' }, /args\.lenses/],
]) {
  test(`Given ${name}, when the gate starts, then it throws before any agent runs`, async () => {
    const world = { reproduce: () => assert.fail('no agent'), lens: () => assert.fail(), inventory: () => assert.fail(), plan: () => assert.fail() };
    await assert.rejects(gate(world, args), pattern);
  });
}

test('meta is a pure literal named root-cause-gate and every phase used is declared', () => {
  const { src } = load();
  const m = src.match(/^export const meta = (\{[\s\S]*?\n\})\n/m);
  assert.ok(m, 'meta block found');
  assert.ok(!/\$\{|\.\.\./.test(m[1]), 'meta has no interpolation or spread');
  const meta = Function(`"use strict"; return (${m[1]})`)();
  assert.equal(meta.name, 'root-cause-gate');
  const titles = meta.phases.map((p) => p.title);
  const used = [...src.matchAll(/\bphase\('([^']+)'\)/g), ...src.matchAll(/phase: '([^']+)'/g)].map((x) => x[1]);
  assert.ok(used.length > 0);
  for (const t of used) assert.ok(titles.includes(t), `phase "${t}" is in meta.phases`);
  for (const banned of ['Date.now(', 'Math.random(', 'new Date()', 'require(', 'process.', 'import(']) assert.ok(!src.includes(banned), `no ${banned}`);
});

test('Given the skill page, then it states the cost per issue and the lens selection rule', () => {
  const text = readFileSync(SKILL, 'utf8');
  assert.match(text, /^name: root-cause-gate-guide$/m);
  assert.match(text, /subagents per issue/i);
  for (const word of ['contract', 'ADR', 'hook', 'unattended']) assert.ok(text.includes(word), `names the ${word} trigger`);
  for (const lens of ALL_LENSES) assert.ok(text.toLowerCase().includes(lens), `names the ${lens} lens`);
});
