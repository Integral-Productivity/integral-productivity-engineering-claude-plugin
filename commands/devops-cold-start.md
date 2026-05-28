---
description: Start a new Integral-Productivity repo against the org standard. Routes by work-type (mcp-server / typescript-sdk / claude-plugin / omnifocus-plugin) to the right template and scaffolding skill, then verifies the new repo classifies under devops-excellence's tier model.
---

Invoke the `devops-excellence-cold-start` skill to walk the cold-start decision tree, recommend the matching `template-*` repo and `type-<workType>` topic, delegate the application scaffold to the right sibling skill (`bootstrap-mcp-server` for MCP servers, `bootstrap-private-sdk` for SDKs), and verify the new repo classifies via `classifyRepo()` post-creation.

User's stated intent (if any): $ARGUMENTS
