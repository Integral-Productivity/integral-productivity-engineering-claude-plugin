---
name: bootstrap-mcp-server
description: Scaffold and maintain MCP servers at Integral Productivity. Use when building or updating an IP MCP server -- covers IP-standard project structure, Vercel deployment, dual-transport pattern (stdio + Streamable HTTP), auth conventions, tool/service module organization, and the resource-template `list` callback convention (SAE-014). Invokes anthropic-skills:mcp-builder for base MCP guidance then layers IP conventions on top. Renamed from `ip-mcp-builder` when moved out of the skills monorepo into the integral-productivity-engineering plugin (the `ip-` prefix is redundant inside an IP-only plugin; `bootstrap-` aligns with the org vocabulary established by `pnpm bootstrap-repo` and the sibling `bootstrap-private-sdk`).
status: draft
version: 1.2.0
---
# Bootstrap an IP MCP server

## Overview

This skill guides the creation and maintenance of MCP servers following Integral Productivity's internal standards. It layers IP-specific conventions on top of the base MCP guidance in `anthropic-skills:mcp-builder`.

**Step 0: Invoke `anthropic-skills:mcp-builder` first.** That skill covers MCP design principles, protocol documentation, tool implementation patterns, and evaluation creation. This skill adds what's IP-specific on top.

---

# IP Standards and Conventions

## Project Structure

Every IP MCP server follows this layout:

```
<server-name>/
├── api/
│   └── mcp.ts              <- Vercel HTTP entry point (serverless handler)
├── src/
│   ├── server.ts           <- McpServer factory; registers all tool modules
│   ├── tools/
│   │   └── <domain>.ts     <- one file per tool domain
│   ├── resources/
│   │   └── <domain>.ts     <- one file per resource domain (templates + list callbacks)
│   └── services/
│       └── <service>.ts    <- API client wrappers
├── dist/                   <- tsc output (gitignored)
├── vercel.json
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

Rationale:
- `api/mcp.ts` is the Vercel entry point -- it handles HTTP concerns (method guard, auth env check, transport lifecycle).
- `src/server.ts` is transport-agnostic -- the same factory works for both stdio (local) and Streamable HTTP (Vercel).
- `src/tools/<domain>.ts` keeps tool registration modular; each exports a `register*Tools(server, getToken)` function.
- `src/resources/<domain>.ts` mirrors that for the resource surface; each exports a `register*Resources(server, client)` function, and each `ResourceTemplate` there carries a `list` callback unless it is deliberately addressable-only (see below).
- `src/services/<service>.ts` holds the API client -- thin axios wrappers with auth headers baked in.

---

## Dependencies

Use these packages and version ranges for new servers:

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "axios": "^1.7.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

**Do not add `@vercel/node`** as a dependency. Use minimal TypeScript interfaces instead (shown below) to avoid its vulnerable transitive dependencies.

---

## npm Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "vercel-dev": "vercel dev"
  }
}
```

---

## Vercel Deployment

### vercel.json

Use the rewrites pattern (preferred over the older `builds`/`routes` style):

```json
{
  "buildCommand": "",
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/mcp"
    }
  ]
}
```

Set environment variables in the Vercel dashboard project settings -- not in `vercel.json`.

### api/mcp.ts -- Vercel HTTP Handler

Canonical pattern for every IP MCP server:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMyMcpServer, resolveApiKey } from '../src/server.js';

// Minimal interfaces -- do NOT import from @vercel/node
interface VercelReq extends IncomingMessage {
  body?: unknown;
}

interface VercelRes extends ServerResponse {
  status(code: number): VercelRes;
  json(body: unknown): void;
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed -- MCP requires POST' });
    return;
  }

  let apiKey: string;
  try {
    apiKey = resolveApiKey();
  } catch {
    res.status(500).json({ error: 'Server misconfiguration: API key env var is not set' });
    return;
  }

  const server = createMyMcpServer(apiKey);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless -- no session affinity needed on Vercel
    enableJsonResponse: true,
  });

  res.on('close', () => { void transport.close(); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as Record<string, unknown>);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

Key decisions:
- **Stateless transport** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) -- simpler to scale on Vercel serverless; no session affinity required.
- **POST-only** -- return 405 for GET/DELETE/etc.
- **`res.on('close', ...)`** -- ensures transport cleanup when the serverless function tears down.
- **Check `res.headersSent`** in the catch block to avoid double-response crashes.

---

## Dual Transport (src/server.ts)

The server factory is transport-agnostic. `src/server.ts` exports:
- `createMyMcpServer(apiKey)` -- returns a configured `McpServer` instance
- `resolveApiKey()` -- reads the env var, throws with a clear message if absent

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFooTools } from './tools/foo.js';

export function resolveApiKey(): string {
  const key = process.env.MY_SERVICE_API_KEY;
  if (!key) throw new Error('MY_SERVICE_API_KEY is not set');
  return key;
}

export function createMyMcpServer(apiKey: string): McpServer {
  const server = new McpServer({ name: 'my-service', version: '1.0.0' });
  registerFooTools(server, apiKey);
  return server;
}
```

For **local stdio** (Claude Desktop config), add `src/index.ts`:

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMyMcpServer, resolveApiKey } from './server.js';

async function main(): Promise<void> {
  const apiKey = resolveApiKey();
  const server = createMyMcpServer(apiKey);
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

---

## Tool Module Pattern (src/tools/<domain>.ts)

Each domain module exports a single registration function:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiGet } from '../services/my-service.js';

export function registerFooTools(server: McpServer, apiKey: string): void {
  server.registerTool(
    'foo_list',
    {
      description: 'List all foo items',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe('Max items to return'),
        cursor: z.string().optional().describe('Pagination cursor from previous response'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, cursor }) => {
      const data = await apiGet(apiKey, '/foos', { limit, cursor });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
```

---

## Resource Template Pattern (src/resources/<domain>.ts)

Resources are the other half of the MCP surface alongside tools. The convention below is
[SAE-014](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-014-mcp-resource-templates-need-list-callbacks.md),
which amends SAE-003 with a resource-surface constraint. Read it for the full reasoning;
what follows is the rule and the pattern that implements it.

### 1. A resource meant to be *found* supplies a `list` callback

**Claude Code has no `resources/templates/list` surface.** Its MCP resource tooling is
exactly three tools -- one wrapping `resources/list`, one wrapping `resources/read`, and one
wrapping a `resources/directory/read` extension. Nothing enumerates resource templates.

So a `ResourceTemplate` registered with `list: undefined` is not rendered *poorly* in Claude
Code -- **it is not rendered at all.** It stays readable if a caller composes the URI by
hand, so nothing errors and nothing logs; the resource is simply absent from every surface
a person looks at.

The test is **not** "is this a template?" It is:

> **Is anyone expected to discover this without already knowing its URI?**

If yes, it needs `list`. `list: undefined` is reserved for templates that are deliberately
addressable-only -- a URI shape the caller already holds from a tool result or another
resource, where enumeration is meaningless or unbounded.

**Why the wrong intuition is tempting.** The reasoning that produces `list: undefined` is
sound on its face: *"the template is advertised through `resources/templates/list`, and a
caller gets the ids from a tool."* Both halves are true of the protocol. Only the first is
false of the client. A design that is correct against the specification can still be
invisible against the client the org actually ships to -- which is why the rule is worth
carrying in the scaffold rather than re-derived per server.

**Other clients.** This is verified against **Claude Code** only. Claude Desktop, Cline,
Continue, Windsurf, and Cursor were not checked. For any client you have not verified,
supply the callback anyway: the conservative direction costs a bounded, shared read, and the
optimistic direction costs invisibility that fails silently.

### 2. The callback is shared across templates and bounded

Rules 1 and 2 are **one decision**. Shipping 1 without 2 trades an invisibility bug for a
performance one.

The SDK's `resources/list` handler walks the registered templates and `await`s each `list`
callback **in turn**. N templates backed by the same query means N reads unless they
deliberately share one. And `resources/list` is issued unprompted on connect and on refresh
-- so whatever work happens there is charged to every session, whether or not any resource
is ever read.

Two obligations follow:

- **Share one read.** Templates backed by the same query memoize a single read across the
  callbacks of one listing.
- **Cap the enumeration.** Bound the response rather than returning whatever the backing
  store holds. The cap bounds the *response*, not the surface -- every item stays readable
  by naming its URI, and the tool that answers "which items exist" still answers without
  truncation.

A sketch of both, with the backing store's own types elided:

```typescript
import { ResourceTemplate, type ListResourcesCallback } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Bound the listing. The backing table grows by a row per publish, forever. */
const LISTING_CAP = 20;

/**
 * How long one read is reused across the templates of a single listing.
 *
 * A short window rather than a per-request cache: there is no request-scoped
 * handle to hang one on in a stateless Vercel function, and the callbacks
 * receive independent `extra` objects. A memo held for the connection's
 * lifetime would keep newly published items out of the listing for as long as
 * the client stayed connected -- a correctness bug wearing a performance
 * costume.
 */
const LISTING_MEMO_MS = 5_000;

const listingMemo = new WeakMap<ApiClient, { at: number; rows: Promise<readonly Row[]> }>();

function recentRows(client: ApiClient): Promise<readonly Row[]> {
  const now = Date.now();
  const cached = listingMemo.get(client);
  if (cached !== undefined && now - cached.at < LISTING_MEMO_MS) return cached.rows;

  // A rejected promise is memoized on purpose: evicting on failure turns one
  // unreachable backend into N failed reads per listing, which is the load
  // pattern you least want while the backend is already unhappy.
  const rows = readRows(client, LISTING_CAP);
  listingMemo.set(client, { at: now, rows });
  return rows;
}

function listItems(client: ApiClient): ListResourcesCallback {
  return async () => {
    let rows: readonly Row[];
    try {
      rows = await recentRows(client);
    } catch (error) {
      // A listing failure degrades to zero entries, never a failed listing.
      // Letting an outage propagate makes the server look broken on connect
      // because an optional discovery convenience could not be computed.
      console.error('mcp resource listing could not enumerate items:', error);
      return { resources: [] };
    }
    return {
      resources: rows.map((row) => ({
        uri: `myserver://item/${encodeURIComponent(row.id)}`,
        name: row.id,
        description: `Item ${row.id}, ${row.count} entries.`,
        mimeType: 'application/json',
      })),
    };
  };
}

server.registerResource(
  'myserver-item',
  // The SDK requires the `list` key either way, so this stays a visible
  // decision rather than a default.
  new ResourceTemplate('myserver://item/{id}', { list: listItems(client) }),
  { title: 'An item', description: '...', mimeType: 'application/json' },
  async (uri, variables) => { /* read one item */ }
);
```

Two further conventions the reference implementation establishes:

- **Degrade, don't fail.** A backing-store outage returns `{ resources: [] }` and logs. A
  failed `resources/list` makes the server look broken on connect over an optional
  convenience.
- **Listing entries carry no authored prose.** Only closed-vocabulary, machine-generated
  values -- ids, timestamps, counts, file names. Client-rendered listing entries have no
  envelope to wrap authored strings in, and clients render them eagerly.

Reference implementation:
[technology-adoption-governance#72](https://github.com/Integral-Productivity/technology-adoption-governance/pull/72)
(merged 2026-08-21), which reverses `list: undefined` on four templates with exactly this
shared memoized read and cap. Its test pins the cost *exactly* -- asserting the listing
reads the backing table **once**, not "at most four times", so a silently broken memo fails
the build.

---

## API Client Pattern (src/services/<service>.ts)

Thin axios wrappers with Bearer auth:

```typescript
import axios from 'axios';

const BASE_URL = 'https://api.example.com/v1';

export async function apiGet(
  apiKey: string,
  path: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const { data } = await axios.get(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    params,
  });
  return data;
}
```

---

## CLAUDE.md for MCP Repos

Every IP MCP repo includes a `CLAUDE.md` at root with:
- Project purpose and deployed Vercel URL
- Active code path (which files matter; flag any deprecated ones)
- Build/run commands
- Architecture overview (entry point -> factory -> tool modules -> service layer)
- Key auth/API details (env var name, base URL, auth scheme, pagination style)
- Daily Kaizen section (morning scan focus, relevant skills, signal routing)

Reference example: `~/GitHub/productboard-mcp-server/CLAUDE.md`

---

## Deployment Checklist

Before shipping a new or updated IP MCP server to Vercel:

- [ ] `npm run build` passes with no TypeScript errors
- [ ] `vercel.json` uses the rewrites pattern (not the older builds/routes style)
- [ ] Environment variables set in Vercel dashboard project settings (not in vercel.json)
- [ ] `api/mcp.ts` uses minimal VercelReq/VercelRes interfaces (no `@vercel/node` import)
- [ ] Transport is stateless (`sessionIdGenerator: undefined`, `enableJsonResponse: true`)
- [ ] 405 guard present for non-POST requests
- [ ] `resolveApiKey()` throws with a clear message when the env var is absent
- [ ] `res.on('close', ...)` transport cleanup is wired up
- [ ] `res.headersSent` checked before error response in catch block
- [ ] Every `ResourceTemplate` meant to be discovered supplies a `list` callback (SAE-014); any remaining `list: undefined` is deliberately addressable-only and a comment says why
- [ ] Templates backed by the same query share one memoized read, and the enumeration is capped
- [ ] A listing failure degrades to `{ resources: [] }` rather than failing `resources/list`
- [ ] Resource listing verified in Claude Code (not only MCP Inspector) -- the resource actually appears, since template-only registration is invisible there
- [ ] MCP Inspector test passes locally: `npx @modelcontextprotocol/inspector`
- [ ] `CLAUDE.md` reflects current active code path and commands
- [ ] Vercel deployment URL tested end-to-end with a real tool call

---

# Reference Files

These supplement the reference files bundled with `anthropic-skills:mcp-builder`:

- [MCP Best Practices](./reference/mcp_best_practices.md) -- universal naming, response format, pagination, transport selection
- [TypeScript Implementation Guide](./reference/node_mcp_server.md) -- TypeScript/Node patterns and examples
- [Python Implementation Guide](./reference/python_mcp_server.md) -- Python/FastMCP patterns (for non-Vercel servers)
- [Evaluation Guide](./reference/evaluation.md) -- evaluation creation guidelines and scripts
