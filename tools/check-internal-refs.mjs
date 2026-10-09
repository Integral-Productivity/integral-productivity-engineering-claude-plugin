#!/usr/bin/env node
// Flags references to the org's non-public repositories in this PUBLIC plugin
// (issue #97). Internal or private repo names, and their issue numbers, are
// cited generically here ("a sibling internal plugin"); this check keeps it so.
//
//   node tools/check-internal-refs.mjs                  # every tracked file, minus config excludes
//   node tools/check-internal-refs.mjs <file>...        # only these files (excludes not applied)
//   node tools/check-internal-refs.mjs --config <path>  # another config
//
// It catches ACCIDENTAL mentions: someone writing a repo name the ordinary way.
// It is not a defence against deliberate evasion, and the "Not caught" list
// below says so.
//
// The check fails closed on a public allowlist. tools/internal-refs.config.json
// lists the org repos whose visibility is PUBLIC, and any repo name not on that
// list is treated as internal. A new or unknown repo is internal until someone
// adds it. No internal name is stored anywhere, plain or hashed, because a
// stored name (or a hash of a short, guessable one) would publish it.
//
// Rules (no network at check time):
//   org-repo          <org>/<repo>, any case, with an optional .git, URLs and
//                     @<org>/<package> npm scopes included, where <repo> is not
//                     in publicRepos. A placeholder such as @<org>/<pkg>, with
//                     literal angle brackets, names nothing and passes.
//   plugin-name       any <name>-claude-plugin token not in publicRepos
//   cross-repo-issue  <hyphenated-name>#<digits> where the name is not in publicRepos
//
// Not caught (accepted limits). Catching the first group would mean listing
// internal names; the second group is evasion-shaped, not accidental:
//   - a bare one-word internal name, with no org prefix and no -claude-plugin suffix
//   - <word>#N shorthand where <word> is a one-word name (PR#N, issue#N pass)
//   - a bare hyphenated internal name with no org prefix, suffix or #N
//   - names written with Unicode hyphens, spaces or underscores instead of "-"
//   - -claude-plugins (plural) and suffixed plugin names such as <name>-claude-plugin-v2
//   - an escaped slash after the org: %2F or \/
//   - a zero-width character around the slash, or a fullwidth slash
//   - spelling variants of the org name itself
// Reviewers still own those shapes.
//
// Exit 0: no findings. Exit 1: findings, printed as file:line: rule: token.
// Exit 2: bad arguments (an unknown flag, or a file argument that does not
// exist), or a config that is unreadable or missing a required key, so nothing
// was checked.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_CONFIG = join(REPO_ROOT, 'tools', 'internal-refs.config.json');

export function loadConfig(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof config.org !== 'string' || !Array.isArray(config.publicRepos)
    || !Array.isArray(config.exclude)) {
    throw new Error('config needs org, publicRepos and exclude');
  }
  return config;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trimDots = (s) => s.replace(/[.]+$/, '');

export function scanText(text, config) {
  const pub = new Set(config.publicRepos.map((r) => r.toLowerCase()));
  const orgRepo = new RegExp(`${escape(config.org)}/([A-Za-z0-9._-]+)`, 'gi');
  // Not followed by another name character: ADR-030-claude-plugin-repo-naming is a file name.
  const plugin = /[A-Za-z0-9][A-Za-z0-9._-]*-claude-plugin(?![A-Za-z0-9_-])/gi;
  const crossRepo = /([A-Za-z][A-Za-z0-9._]*(?:-[A-Za-z0-9._]+)+)#\d+/g;

  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const seen = new Set();
    const add = (rule, token) => {
      const key = `${rule}\0${token.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({ line: i + 1, rule, token });
    };
    for (const m of line.matchAll(orgRepo)) {
      const repo = trimDots(m[1]).replace(/\.git$/i, '');
      if (repo && !pub.has(repo.toLowerCase())) add('org-repo', repo);
    }
    for (const m of line.matchAll(plugin)) {
      if (!pub.has(m[0].toLowerCase())) add('plugin-name', m[0]);
    }
    for (const m of line.matchAll(crossRepo)) {
      const name = trimDots(m[1]);
      if (!pub.has(name.toLowerCase())) add('cross-repo-issue', name);
    }
  });
  return findings;
}

function trackedFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

export function scanFiles(files, config, root) {
  const findings = [];
  for (const file of files) {
    const abs = resolve(root, file);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    if (buf.includes(0)) continue; // binary
    for (const f of scanText(buf.toString('utf8'), config)) {
      findings.push({ file: relative(root, abs) || file, ...f });
    }
  }
  return findings;
}

function main(argv) {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { config: { type: 'string' } },
    });
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  let config;
  try {
    config = loadConfig(args.values.config ?? DEFAULT_CONFIG);
  } catch (e) {
    console.error(`cannot read config: ${e.message}`);
    return 2;
  }
  let files = args.positionals;
  const missing = files.filter((f) => !existsSync(resolve(f)));
  if (missing.length) {
    console.error(`no such file: ${missing.join(', ')}`);
    return 2;
  }
  if (files.length === 0) {
    const excluded = new Set(config.exclude.map((e) => e.path));
    const tracked = trackedFiles(REPO_ROOT);
    for (const e of config.exclude) {
      if (!tracked.includes(e.path)) console.error(`warning: excluded path is not tracked: ${e.path}`);
    }
    files = tracked.filter((f) => !excluded.has(f));
  }
  const root = args.positionals.length ? process.cwd() : REPO_ROOT;
  const findings = scanFiles(files, config, root);
  for (const f of findings) console.log(`${f.file}:${f.line}: ${f.rule}: ${f.token}`);
  if (findings.length) {
    console.log(`\n${findings.length} reference(s) to non-public repos. Cite them generically ("a sibling internal plugin"), or, if the repo is public, add it to publicRepos in tools/internal-refs.config.json.`);
    return 1;
  }
  console.log(`ok: ${files.length} file(s) checked, no references to non-public repos`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
