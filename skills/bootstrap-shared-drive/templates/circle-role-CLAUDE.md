## Domain holder

**<ROLE_OR_CIRCLE_NAME>** (GlassFrog role `<ROLE_ID>`<, within the
<PARENT_CIRCLE_NAME> circle — omit if this is a root circle>) is the domain
holder for this drive.

## Essential context

Do not rely on a static copy of this role's context. Before work in this
drive, look up the current context in GlassFrog:

1. Call `glassfrog_get_role` with `role_id: <ROLE_ID>`
   and `include: ["assignments", "parent_role"]`.
2. Read the purpose, accountabilities, domains, and current filler(s) from
   that response.
3. If the role ID does not resolve, call `glassfrog_search` with
   "<ROLE_OR_CIRCLE_NAME>" (types: role) and tell the human that this
   CLAUDE.md needs regeneration.

If GlassFrog is not connected, stop and ask the human for the role context.
Do not guess it.

## Working in this drive

- This drive belongs to a role/circle, not a person — frame proposals,
  tensions, and projects in role language (Holacracy Constitution terms),
  not personal preference.
- If work here crosses into another role's accountabilities or domains,
  name the boundary rather than acting past it.
