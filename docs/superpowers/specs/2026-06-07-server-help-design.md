# Server Help Exposure Design

Date: 2026-06-07
Status: Approved for implementation planning

## Context

The CLI already has a mature local help system. It covers top-level help, command-specific help, command groups, local command search, dynamic commands from the cached OpenAPI metadata, shell completion descriptions, local-only commands, accepted CLI argument forms, aliases, examples, default payload fields, and API route previews.

As of gameserver v0.350.0, server help has been restored and expanded. Every tool exposes a help action with `topic=<action|category|keyword>`, and topic lookup searches across tools so any help endpoint can point the user to the tool and action that own a command.

These two systems answer different questions:

- Local help answers: "How do I use this CLI command?"
- Server help answers: "What does the live game server say exists, and where does this action live?"

The CLI should expose both without making ordinary help slower, network-dependent, or ambiguous.

## Goals

- Keep local help as the default behavior for `spacemolt help`, `spacemolt --help`, command trailing `help`, and command trailing `--help` or `-h`.
- Add an explicit server help entrypoint for live gameserver discovery.
- Avoid exposing every generated `{tool}_help` route as a normal user-facing CLI command.
- Make it clear when output is local CLI guidance versus live server API guidance.
- Preserve offline, unauthenticated, and empty-profile local help behavior.
- Map server help results back to local command names when possible.
- Remove stale messaging that says server help topic filters are ignored.

## Non-Goals

- Do not replace local help with server help.
- Do not automatically call the network when local help has no match.
- Do not merge server help into every local help page by default.
- Do not redesign the command registry, formatter system, or OpenAPI cache format beyond what this feature needs.
- Do not make server help the source of shell completion metadata.

## User-Facing Behavior

### Local Help Remains Default

These commands continue to render local help without a network call:

```bash
spacemolt help
spacemolt --help
spacemolt help travel
spacemolt help nav
spacemolt help all
spacemolt help command=get_status
spacemolt travel --help
spacemolt travel help
spacemolt commands --search fuel
```

Local help remains the source of truth for CLI-specific details:

- Friendly command names
- Positional usage
- Accepted key-value and flag forms
- CLI aliases
- CLI defaults and route defaults
- Local-only commands such as `help`, `commands`, `ids`, `where-can-i`, `profile`, and `sync-api`
- Examples and "see also" metadata
- Cached generated commands available through dynamic OpenAPI metadata

### Server Help Entry Point

Add a local command:

```bash
spacemolt server-help [topic]
```

Also support this alias:

```bash
spacemolt help --server [topic]
```

The canonical help text should prefer `spacemolt server-help [topic]` because it is unambiguous and does not overload the default local help path.

Examples:

```bash
spacemolt server-help
spacemolt server-help repair
spacemolt server-help market
spacemolt server-help fuel
spacemolt help --server repair
```

Implementation should call a single canonical server route, preferably `spacemolt/help` with payload `{ topic }` when a topic is present. Because server topic lookup searches across tools, callers do not need to choose the correct tool-specific help route.

### Unknown Local Help Topics

When local help cannot find an exact command or group, it should keep the existing local search behavior and add a server-help hint.

Example shape:

```text
Commands matching "repair modules"
  repair - Repair current ship hull and modules.

For live server help, run: spacemolt server-help "repair modules"
```

If there are no local matches:

```text
Commands matching "unknown topic"
  (No local command matches)

For live server help, run: spacemolt server-help "unknown topic"
```

This hint must not trigger a network request.

### Command Help Cross-Link

For API-backed commands, local command help should include a short server help pointer.

Example:

```text
Server help:
  spacemolt server-help repair
```

Local-only commands should not show this pointer because the server cannot describe them.

### Server Help Result Rendering

Server help should use the existing API command execution and response rendering path where possible. If the server returns structured data that identifies a tool and action, the CLI should add a small local mapping section when a matching local command exists.

Example shape:

```text
Server target:
  tool: spacemolt_market
  action: buy

CLI command:
  spacemolt buy <item> <quantity> [delivery=cargo|storage]
```

If no local command maps to the server tool/action, the output should still show the server result and avoid inventing a CLI command.

## Command Model

`server-help` is a local command handler that requires network during execution.

Recommended local metadata:

- command: `server-help`
- usage: `[topic]`
- description: `Fetch live gameserver help for an action, category, or keyword.`
- category: `Reference & Help`
- args: rest topic string
- required: none
- example: `spacemolt server-help repair`
- see also: `help`, `commands`, `sync-api`, `get_commands`

The command should accept all words after `server-help` as a single topic:

```bash
spacemolt server-help faction build
```

This should call server help with:

```json
{ "topic": "faction build" }
```

`spacemolt help --server faction build` should normalize to the same command behavior.

## Architecture

### Local Handler

Add a `server-help` local handler in `src/local-command-handlers.ts`.

Responsibilities:

- Parse optional rest-topic arguments.
- Build an API invocation for the canonical server help route.
- Preserve global output options such as `--json`, `--yaml`, `--structured`, `--field`, `--fields`, `--jq`, `--plain`, `--quiet`, and debug behavior through the normal runner path.
- Avoid writing special server response rendering logic unless needed for local command mapping.

### Route Selection

Use the server route for `spacemolt/help` rather than exposing every generated `{tool}_help` command.

Rationale:

- Topic lookup searches across tools.
- One entrypoint is easier to document.
- It avoids cluttering command search and completion with many near-duplicate help routes.
- It keeps local `help` behavior stable.

### Local Mapping

Add a helper that maps server route identity back to a local command:

Input:

- server tool
- server action
- active command registry snapshot

Output:

- first local command whose `config.route.tool` and `config.route.action` match
- undefined when no local command exists

The helper should consider both bundled and cached dynamic commands through the active registry snapshot. It should not require an exact generated command name match.

### Help Text Updates

Update top-level and full local help text to include server help as a secondary discovery path.

Recommended wording:

```text
Live server help:
  spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword
```

Keep local discovery first:

```text
spacemolt help <command>        Local usage, args, route
spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info
spacemolt commands --search fuel
spacemolt help all              Full local command reference
```

### Stale Warning Removal

Remove or version-gate the renderer warning that says server help returns an unfiltered list and ignores `topic`, `category`, or `command` filters.

For bundled metadata at or after gameserver v0.350.0, this warning is incorrect. Since the current generated spec includes `topic` on help routes, the default behavior should be no warning.

## Error Handling

- If `server-help` cannot connect, use the existing connection error rendering.
- If the user is unauthenticated and the server requires a session, use the normal authentication/session error path.
- If the server returns no matches, render the server response as-is and do not treat it as a CLI error unless the API response is an error envelope.
- If local mapping from server tool/action fails, omit the local mapping section.
- If local `help --server` is used with no topic, call server help with no topic.

## Output Modes

Machine-readable output modes should remain API-shaped:

- `--json`
- `--yaml`
- `--structured`
- compact JSON
- field projection
- jq projection

Local mapping should only be added to human-readable output unless it is included as a clearly namespaced client-side extension. The safer default is to keep machine-readable output as close to the server response as possible.

## Testing

Add or update focused tests:

- `server-help` is discoverable in local help and command search.
- `server-help repair` dispatches to the canonical server help route with `topic=repair`.
- `server-help faction build` joins rest args into `topic="faction build"`.
- `help --server repair` normalizes to the same server help behavior.
- `help`, `--help`, command trailing `help`, and command trailing `--help` remain local and network-free.
- Local command help for API-backed commands includes the server help pointer.
- Local-only command help does not include the server help pointer.
- Unknown local help topics include a server-help hint without calling the network.
- Server help human output maps returned tool/action to a local CLI command when possible.
- JSON and structured output for server help do not receive unsolicited human-only local mapping text.
- The stale "server help filters are ignored" warning is removed or no longer appears for topic payloads.

## Rollout

This can ship as a backwards-compatible minor CLI behavior change:

- Existing local help commands keep their behavior.
- `server-help` is additive.
- `help --server` is additive.
- Removing the stale warning aligns the CLI with the v0.350.0 server behavior.

No migration is required for users.
