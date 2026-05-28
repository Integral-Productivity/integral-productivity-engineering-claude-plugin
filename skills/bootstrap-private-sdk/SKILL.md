---
name: bootstrap-private-sdk
description: >
  Scaffold a TypeScript SDK published to GitHub Packages and consumed by one or
  more in-org projects. Use this skill whenever someone is: creating a new
  private SDK for an Integral-Productivity service (REST/GraphQL/gRPC wrapper),
  extracting a shared client from a project that has grown a second consumer,
  or setting up GitHub Packages publication for an existing TypeScript library.
  Captures the non-obvious gotchas — scope/org naming, cross-platform lockfiles,
  SAML SSO on PATs, stacked-PR pitfalls — that cost hours of debugging on the
  glassfrog-sdk-ts bootstrap. IMPORTANT: invoke this skill BEFORE running
  `npm init` or copy-pasting another SDK's package.json — the order of the
  scaffold steps matters, and most of the friction is preventable upfront.
status: draft
version: 0.1.0
---

# Bootstrap a private TypeScript SDK on GitHub Packages

> **Status:** Draft, written from the glassfrog-sdk-ts retrospective
> ([upgrade design doc](https://github.com/Integral-Productivity/glassfrog-mcp-server/blob/main/docs/superpowers/specs/2026-05-19-v5-upgrade-design.md)).
> Promote to `tested` after the second successful use.

This skill captures every non-obvious step required to ship a TypeScript SDK
to GitHub Packages and have it install cleanly in downstream consumers (CI,
Vercel, local dev). Most of the friction is invisible until you hit it.

## When to use

- Creating a new private SDK for an Integral-Productivity service
- Extracting a shared client from a project that has grown a second consumer
- Adding GitHub Packages publication to an existing TypeScript library

If you're tempted to just `npm init` and copy a `package.json` from another SDK,
**stop and read this first.** The order of the scaffold steps matters, and 3-4
of them are easy to get wrong in ways that won't surface until CI or your first
publish attempt.

## Preflight checklist (do these BEFORE writing code)

1. **Verify the npm scope.** The scope must EXACTLY match the lowercased
   GitHub org name, hyphens preserved.
   - Org `Integral-Productivity` → scope `@integral-productivity`
   - Org `Foo Inc` → there is no such GitHub org; orgs can't have spaces
   - **Wrong:** `@integralproductivity` (no hyphen) → publish fails with
     `403 Forbidden — owner not found`. This error message does NOT suggest
     "rename the scope." Catching this at scaffold saves ~1 hour of
     "why doesn't GitHub Packages know about my org" debugging.

2. **Confirm the consumer plan.** Who installs this SDK?
   - **Local dev:** developer's PAT with `read:packages`, SSO-authorized
   - **CI:** `${{ secrets.GITHUB_TOKEN }}` works automatically (auto-SSO'd)
   - **Vercel / Render / Fly:** project env var `NODE_AUTH_TOKEN` with a PAT
     that has `read:packages` AND is SSO-authorized for the org
   - **External / open-source consumer:** GitHub Packages doesn't allow
     anonymous pulls for private packages. If anyone outside the org needs it,
     publish to public npm under the same scope instead.

3. **Pick a release flow.** Two patterns work cleanly:
   - **Changesets** (`@changesets/cli`) — branch-based, PR-driven, semver
     enforced. Best for SDKs with multiple contributors.
   - **Manual `npm publish`** — fastest for a single-maintainer SDK in
     early-life-cycle exploration.
   This skill assumes Changesets.

## Scaffold

```
glassfrog-sdk-ts/                     # example name
├── package.json                      # see template below
├── tsconfig.json
├── tsup.config.ts                    # tsup gives dual ESM+CJS for ~zero config
├── vitest.config.ts
├── .npmrc                            # scope → registry mapping
├── .changeset/config.json
├── openapi/ or schema/               # source of truth for type generation
├── src/
│   ├── index.ts                      # public re-exports
│   ├── client.ts                     # the main class
│   ├── errors.ts
│   ├── paginate.ts                   # if the API paginates
│   └── types/
│       └── generated.ts              # codegen output (checked in)
├── scripts/
│   └── generate-types.ts             # runs the codegen
├── tests/
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

### `package.json` template (minus the personality)

```jsonc
{
  "name": "@integral-productivity/<sdk-name>",        // ← VERIFY SCOPE
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "clean": "rm -rf dist",
    "generate:types": "tsx scripts/generate-types.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish",
    "prepublishOnly": "pnpm clean && pnpm generate:types && pnpm build && pnpm test && pnpm typecheck"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "engines": { "node": ">=20" }
}
```

### `.npmrc`

```
@integral-productivity:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

### `release.yml` (changesets-driven)

```yaml
name: Release
on:
  push:
    branches: [main]
concurrency: ${{ github.workflow }}-${{ github.ref }}
permissions:
  contents: write
  pull-requests: write
  packages: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
          registry-url: 'https://npm.pkg.github.com'
          scope: '@integral-productivity'
      - run: pnpm install --frozen-lockfile
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: pnpm generate:types
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## The cross-platform lockfile gotcha

The trap: you generate `pnpm-lock.yaml` or `package-lock.json` on macOS, push
it, and CI on Linux fails:

```
Cannot find module @rollup/rollup-linux-x64-gnu
```

This happens because npm/pnpm only record the current platform's optional
native binary (rollup, esbuild, sharp, swc, etc.) in the lockfile. Linux CI
can't install a binary that isn't there.

**Fix:** generate the lockfile in Linux. The simplest path is a Docker
one-liner:

```bash
docker run --rm \
  -v "$PWD":/app -w /app \
  -e NODE_AUTH_TOKEN="$NODE_AUTH_TOKEN" \
  node:20 npm install   # or pnpm install
```

The resulting lockfile lists optional binaries for every platform's variant
of the affected packages, so `npm ci` works on both macOS and Linux.

Add this to your project's CONTRIBUTING.md or root README so the next
contributor doesn't trip on it.

## The "GitHub Actions can't open PRs" gotcha

If your org has Settings → Actions → General → Workflow permissions →
"Allow GitHub Actions to create and approve pull requests" **disabled** (the
default and the recommended posture for many orgs), the Changesets release
workflow will fail to open its Version Packages PR with:

```
GitHub Actions is not permitted to create or approve pull requests.
```

Two workarounds:
1. **Bundle the version bump into the merging PR.** Run `pnpm changeset version`
   locally before pushing the consolidating PR, so when it merges the
   workflow's `publish` step runs directly (no Version PR needed).
2. **Re-enable the setting** for this repo specifically. Trade-off: any
   workflow can now open PRs, increasing the surface for supply-chain
   attacks if a workflow file is compromised.

Choose (1) by default for security-sensitive orgs; (2) if you want hands-off
release cadence.

## The stacked-PR + auto-delete-branch trap

If your repo has "Automatically delete head branches" enabled (Settings →
General → Pull Requests), stacked PRs can vanish their parents:

- PR #2 has `base: chore/scaffold-sdk`
- PR #1 has `base: main` (the scaffold PR)
- You merge PR #1 first
- The `chore/scaffold-sdk` branch is auto-deleted
- PR #2 is now orphaned — GitHub closes it as "merged" because its base
  branch disappeared, but its content went into the deleted branch, not main

**Two safe patterns:**

1. **Consolidate before merging up.** Have one PR per logical milestone go to
   `main` directly. If you've been stacking locally, rebase to a single
   branch off `main` and open one consolidating PR.
2. **Disable auto-delete for the duration of the stack.** Re-enable after.

See [glassfrog-sdk-ts#5 (the consolidating PR)](https://github.com/Integral-Productivity/glassfrog-sdk-ts/pull/5)
for an example recovery.

## SAML SSO on consumer tokens

PATs need to be SSO-authorized for the org separately from token creation.
After generating a token with `read:packages`:

1. Go to https://github.com/settings/tokens
2. Find the token in the list
3. Click "Configure SSO" next to it
4. Click "Authorize" for your org

Without this, `npm install` from GitHub Packages fails with:

```
403 Forbidden — Resource protected by organization SAML enforcement.
You must grant your Personal Access token access to this organization.
```

**Call this out explicitly when telling someone to set up `NODE_AUTH_TOKEN`** —
don't wait for CI to discover it.

The `secrets.GITHUB_TOKEN` in workflows is auto-SSO'd; this only matters for
developer PATs and platform env vars (Vercel, Render, etc.).

## Consumer setup (the one-liner to paste into the consumer's README)

```markdown
## Installing this SDK

1. Create a GitHub PAT with `read:packages` scope.
2. SSO-authorize it for the Integral-Productivity org (Token settings →
   "Configure SSO" → "Authorize").
3. Export it as `NODE_AUTH_TOKEN`:
   ```bash
   export NODE_AUTH_TOKEN=<your-pat>
   ```
4. Add an `.npmrc` at the consumer repo root:
   ```
   @integral-productivity:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```
5. Install:
   ```bash
   npm install @integral-productivity/<sdk-name>
   ```

In CI: use `${{ secrets.GITHUB_TOKEN }}` (auto-SSO'd) as `NODE_AUTH_TOKEN`.
In Vercel / other platforms: add the PAT as the `NODE_AUTH_TOKEN` env var.
```

## After the first release

- [ ] Verify the package landed: `https://github.com/orgs/<org>/packages?package_type=npm`
- [ ] Smoke-install in a scratch project to confirm consumer auth flow works
- [ ] File an issue against the first consumer's repo with the migration plan
- [ ] Once two consumers are on `^0.x`, plan the `1.0.0` bump and stable API freeze

## When to promote this skill (`draft` → `tested`)

After it's been used successfully on at least one more SDK scaffold (i.e. a
non-glassfrog SDK) without needing significant correction.
