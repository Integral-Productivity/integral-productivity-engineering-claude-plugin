---
name: writing-dispatch-prompts
description: >
  Use when handing a unit of work to another agent session — firing,
  spawning, or dispatching a session or chip at an issue ("fire a
  session for #123", "spawn sessions for these follow-ups", "kick off
  an agent on this"), writing the prompt that session will receive, or
  running several sessions against one repo at the same time. Also use
  when a dispatched session re-derived context you already had,
  re-litigated a settled decision, collided with a sibling in one file,
  or reported "already claimed" ambiguously.
status: draft
version: 0.1.0
---

# Writing dispatch prompts

A dispatch prompt is a **contract**, not a summary. The receiving session can
read the issue itself; what it cannot get anywhere else is what *you* verified
and what *the fleet* is doing right now. That is the part worth writing.

## The contract

A dispatch prompt contains these parts, in this order:

1. **Claim instruction** — the exact command, plus the STOP condition if a claim
   already exists.
2. **The issue link**, and "read the body first."
3. **Ground truth verified beyond the issue body** — what you checked, what you
   found, and the date you checked it. Highest-value section: it is everything
   that changed since the issue was filed.
4. **Scope fence** — files this session owns; files it must not touch, each with
   the reason and the owning issue.
5. **Settled premises** — decisions already made, not to be re-litigated, with
   where the rationale lives.
6. **Verification** — the commands, their expected numbers, and "report actual
   numbers, not 'passing'."
7. **PR conventions** — closing keyword at creation time, branch naming, no drafts.

## Two rules earned the hard way

**Claim by label, never by assignment**, wherever an automation triggers on
`issues: [assigned]`. Assigning to claim spawns another session — the claim step
becomes the runaway it was meant to prevent.

**When the work product mutates the coordination substrate** — a reaper that
deletes claim locks, a sweep that strips claim labels — fence it to dry-run by
default and fixture-based tests. Otherwise one exploratory run against the live
repo unlocks the sessions those locks are currently protecting.

## Naming a sibling in a fence

Reference siblings by **issue number, never by a filename they have not chosen
yet**. A fence that names `claim-lock-reaper.yml` is wrong the moment the
sibling picks a different name; a fence that says "#1164 owns the reaper
workflow" stays true regardless of merge order.

## Checking a claim before you dispatch

The two available signals fail in opposite directions, so one is a coin flip:

| Signal | Property | Fails by |
|---|---|---|
| Issue label / claim ref | Authoritative, cross-machine | **Lagging** — a live claim has no PR or branch for its first minutes, so it looks identical to a stale one |
| Live session list | Real-time, leading | **Machine-local**, title-keyed — misses claims from other machines |

A running session naming the issue is a real claim. An aged lock with no running
session, no branch, and no PR is decayed. On a confirmed duplicate, leave the
label alone — removing it strips the owner's claim.

## Common mistakes

**Summarizing the issue back.** The session can read it. Spend the words on what
you verified instead.

**A fence with no "do not touch" list** when a sibling is running. Ownership is
decided before dispatch or not at all.

**Omitting the date** from ground truth. "Verified against `origin/main`" is
unfalsifiable; "verified 2026-07-31" tells the session when to re-check.
