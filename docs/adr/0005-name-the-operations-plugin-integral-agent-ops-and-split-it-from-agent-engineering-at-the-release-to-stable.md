# 5. Name the operations plugin Integral Agent Ops and split it from Agent Engineering at the release to stable

Date: 2026-10-22

## Status

Accepted

Applies [ADR-0003](0003-split-engineering-practice-into-a-software-engineering-core-and-domain-plugins.md) (the split rule).

## Context

`integral-productivity-asset-ops` v0.1.0 lived in an internal skills monorepo that is being wound down. It shipped only as a claude.ai upload and had four skills: `asset-catalog`, `asset-lifecycle`, `bundle-builder` and `plugin-publisher`. All four read or wrote that monorepo. None of them knew the marketplace catalogs, `claude-config` or install verification.

ADR-0003 creates a separate Integral Agent Engineering plugin for the engineering of agents (`writing-dispatch-prompts`, `fixer`, `verifier`, `fix-queue`). Two plugins that both handle "agentic assets" need a boundary, or new work lands in whichever one the author thinks of first.

The operator's new asks on 2026-10-22 were all operations after a release: a repeatable marketplace path, an install-verification protocol, and the cloud-environment plugin list in `claude-config`.

Applying the ADR-0003 split rule to the operations work:

| Criterion | Result |
|---|---|
| Audience | True. It runs when a plugin is released, listed, installed or retired, not while a plugin is built. |
| External dependency | True. It needs the marketplace repos, `claude-config` and the `marketplace-ref-reader` and `MARKETPLACE_PAT` tokens. |
| Change rate | Not applicable. It is new work in its own repo. |
| Self-contained files | True. No file outside it loads its files by relative path. |

## Decision

1. **Name.** The plugin is **Integral Agent Ops**, plugin name `agent-ops`, in its own internal repository. It replaces `integral-productivity-asset-ops`; the namespace changes to `agent-ops:`.
2. **Seam.** The boundary between Integral Agent Engineering and Integral Agent Ops is the **release to `stable`**:
   - Before it is engineering: design, scaffold, implement, test, review, `claude plugin validate` in CI, the plugin template.
   - The release itself (release-please, the `vX.Y.Z` tag, `promote-stable.yml`) stays in each plugin repo. Checking that it ran belongs to Ops.
   - After it is operations: catalog and lifecycle state, catalog entries, `claude-config` cloud-environment lists, install verification on each surface, upload-limit checks before publishing, deprecation and removal.
3. **Direction of moves.** Work moves from the old asset-ops into Agent Ops only. Nothing moves from Agent Ops to Agent Engineering. `bundle-builder` and `plugin-publisher` are replaced by one `agent-ops:plugin-release` skill.

## Consequences

- An author can tell from the names which plugin owns a task: build questions go to Agent Engineering, run questions go to Agent Ops.
- "AgentOps" is also an industry term and a product name for monitoring running agents. Some readers will expect telemetry. The "Integral" prefix reduces the confusion. No trademark search was done, as for the other "Integral" names.
- Agent Ops is private and listed in `integral-productivity-internal`, so it reaches the CLI, Desktop Code and every cloud environment, but not Cowork unless someone uploads a zip.
- The core `marketplace` catalog uses folders that CI copies in (marketplace ADR 0002). That pipeline is not finished, so `plugin-release` cannot yet release a core plugin.
- When Integral Agent Engineering is extracted (ADR-0003, order of work step 2), its README must point to Agent Ops for anything after the release.
