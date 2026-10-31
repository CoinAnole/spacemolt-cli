---
name: issues-to-discord
description: >
  Turn markdown notes in issues/ into paste-ready SpaceMolt Discord posts.
  Post a contradiction, or a functional OpenAPI gap a client must send or
  parse. Do not post a request to mention a changelog fact in a guide that
  never stated it. Use when the user runs /issues-to-discord, or asks to
  draft Discord posts from the issues directory.
user-invocable: true
---

# Issues to Discord

Draft upstream docs and OpenAPI requests from `issues/*.md`. Do not edit the notes. Do not change the CLI. Do not fetch `spacemolt-docs`, run `generate:api`, or set `LIVE_API_SYNC`.

## What becomes a post

Read the notes the user names. If they name none, read every markdown file in `issues/`.

A post is a **contradiction** or a **functional OpenAPI gap**.

A contradiction is two cached statements about the same fact that disagree. Sources are the cached changelog, `spacemolt-docs/` prose, and `spacemolt-docs/openapi.json`. Quote both sides and name the file, heading, or operation. A false statement is a contradiction when another cached source states the fact. Example: a guide says the wreck appears at your current POI, while the changelog and another page say it stays at the death POI. The guide line is the post. Pages that never say where a wreck stays are not.

A functional OpenAPI gap means a client must send or parse a request field, response field, enum value, error code, or event payload, and `openapi.json` does not define that piece or defines it so it cannot be used. Name the operation or schema and what the client cannot do. Do not invent a type, an example, or a live payload.

**Prose silence is not a post.** A guide or operation description that never mentions a changelog fact is not wrong. Do not ask authors to add a sentence because the changelog added z and the page still only says x and y. Skip that ask even when the note says "please document this." Include that kind of silence only when the user explicitly asks for the missing text.

A note may set `kind` to `contradiction`, `openapi-gap`, or `prose-gap`. Skip `prose-gap` unless the user explicitly asked for that missing guide text. A `kind` label does not override the prose-silence rule: a note that only asks a guide to mention a changelog fact is still skipped. If `kind` is absent, judge the body.

Leave out CLI-only notes: curated help, tests, display formatters, and golden output. Those are not docs or OpenAPI changes.

## How to write the post

One Discord post per contradiction or functional OpenAPI gap. Split a note that contains several.

- Contradiction: lead with the false or conflicting sentence and where it lives. State the change that removes the conflict. Point at a cached page that already says it correctly when one exists.
- Functional gap: lead with the operation or schema and the missing piece. State what a client cannot send or parse. Ask `openapi.json` to name that piece. Do not ask a guide to add a paragraph.
- Do not explain the mechanic, tour unrelated fields, or invent an error code, response field, or live payload. If the note says a value was not captured, ask the spec to name it.
- Cite the gameserver version from the note, or from `changelog.json` `current_version` and OpenAPI `info.x-gameserver-version` when you recheck a quote.
- Discord markdown: a heading, short bullets, inline code for paths and fields.

## Files

Write `/tmp/discord-post-N.md`. Continue numbering after the highest existing file so earlier drafts stay. Each body is at most 2000 characters, excluding one trailing newline. After writing, count each body and tell the user the absolute path and the count.
