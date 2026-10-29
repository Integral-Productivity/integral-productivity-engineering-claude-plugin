# <DRIVE_NAME> — Claude Code Context

## Domain holder

<DOMAIN_HOLDER_STATEMENT>

## Essential context

<ESSENTIAL_CONTEXT_BLOCK>

## Working in this drive

- Ask before creating, renaming, or deleting files at the drive root;
  subfolders are fair game.
- Keep this CLAUDE.md current — if the domain holder or essential context
  changes, regenerate via the `bootstrap-shared-drive` skill rather than
  hand-editing the header sections above.
- <DRIVE_TYPE_SPECIFIC_CONVENTIONS>

## Finding things in this drive

This Shared Drive is the only source of truth for its files. Use the Google
Drive connector to reach it. The local mount (Google Drive for desktop) is
optional; nothing in this file depends on a local path.

- **This file:** the file titled `CLAUDE.md` whose parent is the drive root
  (Shared Drive ID `<DRIVE_ID>`). Find it with `search_files` and the query
  `title = 'CLAUDE.md' and parentId = '<DRIVE_ID>'`. Do not record its file
  ID anywhere: each revision through the connector gets a new one. Follow
  `nextPageToken` until it is absent; an empty first page does not mean the
  file is missing. If the search returns more than one file, stop and ask
  the human.
- **A Claude Project bound to this drive** holds one pointer: the query
  above. It holds no drive content and no list of drive files.
- **No file list is kept**, here or in a Project. Find files at the time of
  the work:
  - list the folders the task needs: `parentId = '<folder ID>'`;
  - find changes made outside Claude: `modifiedTime > '<date of last known
    work>'`;
  - search by topic: `title contains '…'` or `fullText contains '…'`.
- **Search before you create.** Do not make duplicates.
- **Revising a `.md` file:** the connector cannot change the content of an
  existing non-Google file. Create the new version in the same folder with
  the same title, trash the old one, and say so. Prefer Google Docs for
  files that change often; the Google Docs connector edits them in place.
- **If the Drive connector is not connected,** stop and tell the human.

<FOLDER_MAP>

## Provenance

Generated <DATE> by `bootstrap-shared-drive` v<SKILL_VERSION> from the
`<DRIVE_TYPE>` template.
Standard: [SAE-015](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-015-shared-drive-claude-md-standard.md).
Access and location rules: [SAE-019](https://github.com/Integral-Productivity/software-architecture-excellence/blob/main/docs/adr/SAE-019-shared-drive-context-is-reached-through-the-drive-connector.md).
