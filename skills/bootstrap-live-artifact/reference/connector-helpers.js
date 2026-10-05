// Connector helpers for a published artifact page that reads live data.
// Copy into the page's inline <script> and adapt. Written against the mcp
// capability as it was on 2026-10-05; the `artifact-capabilities` skill is the
// authority for the current call contract.

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Escape every string that came from a connector before it goes into markup.
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One sentence for each error code. Each code has a different fix, so one
// generic message hides the action that would repair the page.
function fixCopy(err, server) {
  const s = server || err?.server || 'This connector';
  switch (err?.code) {
    case 'needs_reauth':
      return `Reconnect ${s} in claude.ai Settings → Connectors, then select Refresh.`;
    case 'server_not_connected':
    case 'server_not_found':
      return `Add ${s} in claude.ai Settings → Connectors, then select Refresh.`;
    case 'selection_required':
      return `More than one ${s} connector is connected. Choose one when Claude asks, then select Refresh.`;
    case 'not_in_manifest':
    case 'consent_required':
      return `${s} is not allowed for this page. Allow it in this artifact's Permissions menu, then select Refresh.`;
    case 'blocked_by_policy':
      return `Your organization's policy blocks ${s} for this page.`;
    case 'approval_required':
      return `${s} needs an approval for each call. Artifacts cannot give that approval yet.`;
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Connector access is not available in this view.';
    case 'server_unavailable':
    case 'rate_limited':
      return `${s} did not answer in time. Select Refresh to try again.`;
    case 'cancelled':
      return `The ${s} request was cancelled. Select Refresh to try again.`;
    case 'tool_error':
      return `${s} reported an error: ${String(err.message || '').slice(0, 240)}`;
    case 'unreadable':   // thrown by this page's own parsers
      return `${s} returned a response this page cannot read. The data is not shown, so do not read this section as empty.`;
    default:
      return `${s} request failed: ${String(err?.message || err || 'unknown error').slice(0, 240)}`;
  }
}

// Reads only. At most one retry, and only when the error says a retry may help.
// Never use this for a write: a rejected write is not proof that it did not run.
async function callRead(mcp, server, tool, input, options) {
  try {
    return await mcp.callTool(server, tool, input, options);
  } catch (e) {
    if (e && e.retryable === true) {
      await sleep(Math.min(e.retryAfterMs ?? (700 + Math.random() * 1300), 60000));
      return await mcp.callTool(server, tool, input, options);
    }
    throw e;
  }
}

// The JSON answer of a call, whatever envelope the connector used.
function payloadOf(res) {
  let p = res?.payload;
  if (p === undefined) {
    p = res?.structuredContent ?? (res?.content || []).find(b => b && b.type === 'text')?.text;
  }
  if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return p; } }
  return p;
}

// A parser returns the list, or throws {code:'unreadable'}. It never returns []
// for a response it did not understand: that is how "no data" turns into
// "nothing to do".
function listFrom(payload, key) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload[key])) throw { code: 'unreadable' };
  return payload[key];
}

// Cursor pagination with a page cap. `complete: false` means the page must say
// that the list is partial.
async function listAll(mcp, server, tool, baseInput, options, maxPages = 20) {
  const items = [];
  let cursor, stamp = null;
  for (let page = 0; page < maxPages; page++) {
    const res = await callRead(mcp, server, tool, cursor ? { ...baseInput, cursor } : baseInput, options);
    const p = payloadOf(res);
    items.push(...listFrom(p, 'items'));
    // A cached result carries the time it was produced. Show the oldest one.
    const at = res?.cache?.storedAt ?? Date.now();
    stamp = stamp === null ? at : Math.min(stamp, at);
    if (!p.pagination?.has_next_page || !p.pagination?.next_cursor) return { items, stamp, complete: true };
    cursor = p.pagination.next_cursor;
  }
  return { items, stamp, complete: false };
}

// Boot. The capability arrives through a promise, and it can be null.
async function boot(onReady, onNoBridge) {
  let mcp = null;
  try {
    mcp = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('mcp') : null;
  } catch (e) { mcp = null; }
  if (!mcp) return onNoBridge();     // name the connectors the page needs
  onReady(mcp);                      // first load: load(false); Refresh: load(true) with {cache:{refresh:true}}
}
