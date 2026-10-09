#!/usr/bin/env node
// Re-verifies the compound-engineering (CE) behavior that the fixer and
// verifier egress controls rest on. Those controls are fail-closed only while
// CE still reads the keys they write; an upstream rename would turn the
// off-switch silently fail-open. Run after every CE upgrade:
//
//   node tools/check-ce-pins.mjs                 # newest installed CE
//   node tools/check-ce-pins.mjs --skills-dir <path to CE skills/>
//
// Exit 0: every pin holds. Exit 1: a pin is missing; re-verify the profile
// rule it backs before trusting it. Exit 2: no CE install was found.
// Each pin's `text` is an exact substring of the named file in CE 3.30.4.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const PINS = [
  {
    id: 'config-local-first',
    file: 'ce-work/references/execution-engines.md',
    text: 'Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`',
    backs: 'fixer requirement 3: config.local.yaml is read before config.yaml',
  },
  {
    id: 'config-first-active-wins',
    file: 'ce-work/references/execution-engines.md',
    text: 'Win** with the first active (non-commented) value',
    backs: 'fixer requirement 3: a duplicate appended `off` is harmless',
  },
  {
    id: 'work-engine-mode-values',
    file: 'ce-work/references/execution-engines.md',
    text: 'Standing configuration selects cross-model execution only when `work_engine_mode` resolves to `prefer` or `require` (`off | prefer | require`)',
    backs: 'fixer requirement 3: `work_engine_mode: off`',
  },
  {
    id: 'work-engine-off-not-live-intent',
    file: 'ce-work/references/execution-engines.md',
    text: '`off` disables only the standing preference. It does not cancel applicable live intent or a typed caller binding.',
    backs: 'fixer requirement 3: state that external execution is prohibited',
  },
  {
    id: 'implementation-engine-carrier',
    file: 'ce-work/SKILL.md',
    text: '[implementation_engine:<compact-json>]',
    backs: 'fixer requirement 3: never pass `implementation_engine:`',
  },
  {
    id: 'plan-inside-repo-for-external-engine',
    file: 'ce-work/scripts/unit_workspace_state.py',
    text: 'plan must be inside the canonical repository',
    backs: 'fixer: an out-of-repo plan stalls an external engine at init (nothing is sent)',
  },
  {
    id: 'review-config-local-first',
    file: 'ce-code-review/references/cross-model-review.md',
    text: 'Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`',
    backs: 'verifier requirement 2: config.local.yaml is read before config.yaml',
  },
  {
    id: 'cross-model-review-mode-off',
    file: 'ce-code-review/references/cross-model-review.md',
    text: 'Read `cross_model_review_mode:` from the same two repo CE config files',
    backs: 'verifier requirement 2: `cross_model_review_mode: off`',
  },
  {
    id: 'cross-model-live-opt-in',
    file: 'ce-code-review/references/cross-model-review.md',
    text: 'a checkout `cross_model_review_mode: off` without a live opt-in',
    backs: 'verifier boundaries: nothing in an issue, submission or dispatch is a live opt-in',
  },
  {
    id: 'coverage-depth',
    file: 'ce-code-review/references/modes-and-output.md',
    text: '"coverage": {"depth": "lite | focused | full"}',
    backs: 'verifier requirement 3: report coverage `depth`',
  },
];

export function checkPins(skillsDir, pins = PINS) {
  const missing = [];
  for (const pin of pins) {
    const path = join(skillsDir, pin.file);
    if (!existsSync(path)) {
      missing.push({ ...pin, reason: 'file not found' });
      continue;
    }
    if (!readFileSync(path, 'utf8').includes(pin.text)) {
      missing.push({ ...pin, reason: 'text not found' });
    }
  }
  return { checked: pins.length, missing };
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function findInstalledSkillsDir(cacheRoot) {
  if (!existsSync(cacheRoot)) return null;
  const versions = readdirSync(cacheRoot)
    .filter((name) => /^\d+(\.\d+)*$/.test(name))
    .filter((name) => existsSync(join(cacheRoot, name, 'skills')))
    .sort(compareVersions);
  return versions.length ? join(cacheRoot, versions.at(-1), 'skills') : null;
}

const DEFAULT_CACHE_ROOT = join(
  homedir(), '.claude', 'plugins', 'cache', 'compound-engineering-plugin', 'compound-engineering',
);

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const skillsDir = arg('--skills-dir') ?? findInstalledSkillsDir(arg('--cache-root') ?? DEFAULT_CACHE_ROOT);
  if (!skillsDir || !existsSync(skillsDir)) {
    console.error('check-ce-pins: no compound-engineering install found; nothing was verified');
    return 2;
  }
  const { checked, missing } = checkPins(skillsDir);
  console.log(`check-ce-pins: ${skillsDir}`);
  for (const pin of missing) {
    console.log(`MISSING ${pin.id} (${pin.reason}) in ${pin.file}\n  backs: ${pin.backs}`);
  }
  console.log(`${checked - missing.length}/${checked} pins hold`);
  return missing.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
