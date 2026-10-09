#!/usr/bin/env node
// Re-verifies the compound-engineering (CE) behavior that the fixer and
// verifier egress controls rest on. Those controls are fail-closed only while
// CE still reads the keys they write; an upstream rename would turn the
// off-switch silently fail-open. Run after every CE upgrade:
//
//   node tools/check-ce-pins.mjs                    # every CE install Claude Code has registered
//   node tools/check-ce-pins.mjs --project <path>   # only the installs that run for one project
//   node tools/check-ce-pins.mjs --skills-dir <path to CE skills/>
//
// Claude Code resolves CE per scope from ~/.claude/plugins/installed_plugins.json,
// so the default checks every registered installPath, not just the newest one
// cached. When the registry cannot be read it falls back to the newest cached
// version and says so, except with --project, where it exits 2 instead.
//
// Exit 0: every pin holds in every install checked. Exit 1: a pin is missing
// somewhere; re-verify the profile rule it backs before trusting it there.
// Exit 2: bad arguments, no CE install was found, or --project was given and
// the registry could not be read, so nothing was verified.
// Each pin's `text` is an exact substring of the named file in CE 3.30.4.

import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

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
    id: 'cross-model-review-mode-off-value',
    file: 'ce-code-review/references/cross-model-review.md',
    text: 'Valid values are `auto` (default) and `off`; anything else is invalid and continues to the next layer, then `auto`. When it resolves to `off`, skip',
    backs: 'verifier requirement 2: `off` is the value that skips the cross-model pass',
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

const PLUGIN_KEY = 'compound-engineering@compound-engineering-plugin';
const PLUGINS_DIR = join(homedir(), '.claude', 'plugins');
const DEFAULT_REGISTRY = join(PLUGINS_DIR, 'installed_plugins.json');
const DEFAULT_CACHE_ROOT = join(PLUGINS_DIR, 'cache', 'compound-engineering-plugin', 'compound-engineering');

// One spelling per directory: absolute, symlinks resolved where the path
// exists, no trailing slash. Raw string matching let `--project .` or a
// trailing slash miss a project's own install and pass on user scope alone.
function normalizePath(path) {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute.length > 1 ? absolute.replace(/\/+$/, '') : absolute;
  }
}

// Distinct CE installs registered with Claude Code, each with the projects it
// serves. With `project`, only the installs that project resolves: its own
// project-scoped entries plus any entry that is not project-scoped; each
// install then carries `matchedProject: true` when it came from the project's
// own entry. Returns null when the registry cannot be read.
export function registeredInstalls(registryPath, { project } = {}) {
  const wanted = project === undefined ? undefined : normalizePath(project);
  let entries;
  try {
    entries = JSON.parse(readFileSync(registryPath, 'utf8')).plugins?.[PLUGIN_KEY];
  } catch {
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const byPath = new Map();
  for (const entry of entries) {
    if (!entry?.installPath) continue;
    const projectScoped = entry.scope === 'project' || entry.scope === 'local';
    const matches = projectScoped && entry.projectPath && normalizePath(entry.projectPath) === wanted;
    if (wanted !== undefined && projectScoped && !matches) continue;
    const install = byPath.get(entry.installPath) ?? { installPath: entry.installPath, version: entry.version, projects: [], matchedProject: false };
    if (entry.projectPath) install.projects.push(entry.projectPath);
    if (matches) install.matchedProject = true;
    byPath.set(entry.installPath, install);
  }
  return [...byPath.values()];
}

function report(skillsDir, label) {
  const { checked, missing } = existsSync(skillsDir)
    ? checkPins(skillsDir)
    : { checked: PINS.length, missing: PINS.map((pin) => ({ ...pin, reason: 'install not found' })) };
  console.log(`${label}: ${skillsDir}`);
  for (const pin of missing) {
    console.log(`  MISSING ${pin.id} (${pin.reason}) in ${pin.file}\n    backs: ${pin.backs}`);
  }
  console.log(`  ${checked - missing.length}/${checked} pins hold`);
  return missing.length === 0;
}

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        'skills-dir': { type: 'string' },
        'cache-root': { type: 'string' },
        registry: { type: 'string' },
        project: { type: 'string' },
      },
    }));
  } catch (error) {
    console.error(`check-ce-pins: ${error.message}; nothing was verified`);
    return 2;
  }
  if (values['skills-dir'] !== undefined) {
    if (!existsSync(values['skills-dir'])) {
      console.error(`check-ce-pins: ${values['skills-dir']} does not exist; nothing was verified`);
      return 2;
    }
    return report(values['skills-dir'], 'check-ce-pins') ? 0 : 1;
  }
  const installs = registeredInstalls(values.registry ?? DEFAULT_REGISTRY, { project: values.project });
  if (installs === null && values.project !== undefined) {
    console.error(`check-ce-pins: the plugin registry could not be read, so the CE that ${values.project} runs is unknown; nothing was verified`);
    return 2;
  }
  if (installs === null) {
    const newest = findInstalledSkillsDir(values['cache-root'] ?? DEFAULT_CACHE_ROOT);
    if (!newest) {
      console.error('check-ce-pins: no plugin registry and no cached CE install found; nothing was verified');
      return 2;
    }
    console.log('NOTICE: the plugin registry could not be read, so only the newest cached CE was checked, which may not be the CE that runs.');
    return report(newest, 'check-ce-pins') ? 0 : 1;
  }
  if (installs.length === 0) {
    console.error('check-ce-pins: no CE install is registered for this scope; nothing was verified');
    return 2;
  }
  if (values.project !== undefined && !installs.some((install) => install.matchedProject)) {
    console.error(`check-ce-pins: no project-scoped CE install is registered for ${values.project}; refusing to report on user scope alone`);
    return 2;
  }
  let allHold = true;
  for (const install of installs) {
    const scope = install.projects.length ? `${install.projects.length} project(s)` : 'user scope';
    allHold = report(join(install.installPath, 'skills'), `CE ${install.version} (${scope})`) && allHold;
  }
  return allHold ? 0 : 1;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = main(process.argv.slice(2));
}
