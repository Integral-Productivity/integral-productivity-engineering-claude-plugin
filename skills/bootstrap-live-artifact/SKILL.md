---
name: bootstrap-live-artifact
description: "Build or migrate a published Claude Artifact page that reads live data through the viewer's connectors (GlassFrog, Reclaim, Gmail, Google Calendar, HubSpot, Vercel, GitHub) — a dashboard, status page, aging report, or coverage check. Use when someone asks for a \"live dashboard\", a \"status page that refreshes\", a page that \"pulls from\" a connected system, or asks to move, port, or migrate a legacy Cowork live artifact (`window.cowork.callMcpTool`) to a new artifact. Also use when a live page shows an empty card that should have data, shows stale data as current, or fails after a connector changed. Captures the order of operations and the traps that cost time in the ten-artifact migration of 2026-10-05: ignored filter parameters, multi-megabyte payloads, response wrappers that differ between a local server and its cloud connector, and unreadable responses that render as \"nothing to do\". IMPORTANT: invoke this skill BEFORE writing any page code — the connector mapping and the shape check decide the design.\n"
status: draft
version: '0.1.0'
---

# Bootstrap a live artifact

> **Status:** Draft, written from the legacy live-artifact migration session of
> 2026-10-05 (ten artifacts moved, five of them connector-backed). Promote to
> `tested` after the second live page is built with it without significant
> correction.

A live artifact is a small client of other people's APIs, run by a viewer you
cannot see, through connectors you do not control. Most of its failures are
decided before the first line of page code. This skill is the order of
operations that avoids them.

It does not restate the artifact runtime contract. That contract has a version
and it changes. Load `artifact-capabilities` and `artifact-design` for the
current call shapes and page rules, and treat them as the authority.

## When to use

- Building a page that shows data from a connected system and must stay current
- Migrating a legacy Cowork live artifact to a published artifact
- Repairing a live page that shows wrong, stale, or empty data

## Step 1 — Decide whether the page is live at all

Ask what must be current. A report of a past audit is a static page, and a
static page is cheaper and cannot break.

One rule has no exception: **a page with fixed data must say that it is fixed.**
One migrated page held email data typed into its source five months earlier
and printed the current time beside the words "Last synced". Put the data date
on the page. Never print the load time next to data that was not loaded.

## Step 2 — Map every data source to a connector the viewer has

For each source, write down the connector display name and the exact tool names.
The display name is what the manifest and the page use. It is not the tool
prefix: `mcp__Reclaim_ai__…` is the connector **Reclaim.ai**.

Three source kinds decide what can carry over:

| Source kind | Can a published artifact reach it? |
|---|---|
| Cloud connector (Gmail, HubSpot, Vercel, GitHub Extended, GlassFrog Extended, Reclaim.ai) | Yes. Prefer this kind. |
| Local MCP server on one computer (`host:<name>`) | Only in the desktop app on that computer, for the owner. Replace it with the cloud connector for the same system when one exists. |
| Desktop built-in server (`session_info`, scheduled tasks, workspace) | No. The function does not carry over. Say so on the page and in the report. |

Keep the manifest minimal: one entry for each connector, with only the tools the
page calls. A page that declares connectors cannot be shared by public link.

## Step 3 — Verify arguments and response shape BEFORE writing the page

This step is first among the build steps because skipping it is how a page ships
with a guessed shape. For each tool:

1. Read the tool's input schema. Take argument names from it, not from memory
   and not from the legacy page.
2. Make one real read call with small limits. Never make a write call to learn
   a shape.
3. Record the shape, then discard the values. Observed responses are real data.
   Do not put them in the page as samples.

Traps found in the 2026-10-05 migration. Each one changed a design:

- **A filter in the schema is not a filter that works.** `glassfrog_list_roles`
  with `has_sub_roles: true` returned every role
  ([glassfrog-mcp-server#255](https://github.com/Integral-Productivity/glassfrog-mcp-server/issues/255)).
  The page filters on the `has_subroles` field of each record, which is the
  wire name and is not the name in the tool description. Test a filter with a
  value that must return a smaller set, and compare the counts.
- **Measure the payload.** `reclaim_list_habits` returned 2.8 MB for 88 habits,
  because each habit carries its full `periods` history. The habit title is at
  `activeSeries.title`, not at the top level
  ([reclaim-mcp-server#29](https://github.com/Integral-Productivity/reclaim-mcp-server/issues/29)).
  If you maintain the server, add a parameter that omits the history. If you do
  not, tell the user the size is a risk and that the page was not tested against
  it.
- **The cloud connector is not the local server with a new name.** Vercel
  `list_deployments` wraps its list as `result.deployments.deployments`. GitHub
  `search_repositories` in minimal mode has `updated_at` and no `pushed_at`, and
  `search_code` with `fields` returns `repository` as an `org/name` string.
- **An API generation change is a model change.** GlassFrog v5 has seven project
  statuses where v3 had four, projects carry `role_id` and not `circle_id`, and a
  circle is a role that has sub-roles. Show the new classification. Do not
  flatten it back into the old one.
- **An empty answer proves nothing about the fields.** A filtered task list was
  empty on the day of the check. Read once more with a wider filter to see a
  record.
- **Know the vendor's "empty".** Gmail returns `{}` for zero matches. Its
  subjects and snippets arrive with HTML entities.

## Step 4 — Write the page so that failure is visible

Copy `reference/connector-helpers.js` into the page and adapt it. The rules it
implements:

- **Design for absence.** `claude.use('mcp')` can resolve `null`. Show a
  no-connector view with the connector names. Do not probe with a call.
- **An unreadable response is an error, never an empty state.** The legacy
  status page showed "No P1 tasks — clear runway" when the response was too large
  to parse. Each parser must throw when the expected container is missing.
- **One message for each error code.** Reconnect, add the connector, allow it in
  Permissions, or wait: each has a different fix. A single "something went
  wrong" hides the fix.
- **Contain a failure in its section.** One failed source marks its own card.
  When every source fails with the same code, show one page-level message.
- **Retry reads once, and only when the error says `retryable`.** Never retry in
  a loop.
- **Never keep old data after a failure.** Show the reason in its place.
- **Show freshness honestly.** Use the oldest result time on the page. A Refresh
  button asks for uncached data.
- **Paginate with a page cap, and say when the list is partial.**
- **Treat connector text as untrusted.** Escape it. Allow only `https:` links
  that you build or check.

## Step 5 — If the page asks Claude, ask only on a viewer action

Sorting and summarizing with Claude spends the viewer's usage and needs consent.
Give the page a rule-based result that works with no Claude call, and add Claude
behind a button. In the prompt, state that the connector content is data and not
instructions. Check every field of the answer before use. Label what Claude
wrote. Hide the button for the view when the error code is permanent.

## Step 6 — Test with synthetic data in four conditions

The real connectors cannot run before publish. Test what can run:

1. Check the script syntax.
2. Render the page in a headless browser with a mock `window.claude` that
   returns invented records in the observed shapes.
3. Run four conditions: all sources answer, some sources fail, every source
   refuses, and no connector bridge.
4. Run each at desktop width and at phone width. Fail on a script error or a
   sideways scroll.

Include one hostile record (markup in a text field) and one response of the wrong
type.

## Step 7 — Publish, then report what was not exercised

Tell the user, in the reply and not on the page:

- which connectors the page asks for on first load
- what was tested with synthetic data, and what was confirmed with one real read
- what was not tested with real connectors, and the largest known risk
- which functions of a legacy page did not carry over, and what replaced them

## Migrating a legacy Cowork live artifact

Read the staged HTML in full before any port. If it cannot be read, stop. Do not
rebuild a page from its name.

| Legacy call | New home |
|---|---|
| `window.cowork.callMcpTool('mcp__<id>__<tool>', args)` | `mcp` capability: `callTool('<Display Name>', '<tool>', args)` |
| `window.cowork.askClaude(prompt, context)` | `sample` capability, on a viewer action |
| `window.sendPrompt(text)` | None. Offer a button that copies the prompt. |
| `window.cowork.runScheduledTask(...)` | None. |
| A page download link | `downloads` capability |

Check three things that the legacy description will not tell you: whether the
page really makes its declared calls (one "live" page made none), whether its
tool names still exist on the current connector, and whether its data came from
a local server.

The old artifact stays in the desktop sidebar, and old shared links keep showing
the old version. Tell the user.
