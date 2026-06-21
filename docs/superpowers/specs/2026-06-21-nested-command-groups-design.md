# Nested Command Groups Design

## Context

The CLI currently exposes many route-derived commands as flat top-level names. This makes shell completion noisy; invoking `spacemolt <TAB>` can offer hundreds of commands, including dense clusters such as:

- `citizenship_apply`, `citizenship_list`, `citizenship_renounce`, `citizenship_withdraw`
- `facility_build`, `facility_job_add`, `facility_set_access`, and other `facility_*` commands
- `faction_info`, `faction_invite`, `faction_create_buy_order`, and other `faction_*` commands
- `fleet_status`, `fleet_invite`, and other `fleet_*` commands
- `forum_list`, `forum_reply`, and other `forum_*` commands
- `station_info`, `station_set_name`, and other `station_*` commands
- `trade_offer`, `trade_accept`, and other `trade_*` commands

The CLI already has one grouped command pattern in `storage`, but it is implemented as a single curated command with an `action` argument. The grouped prefixes listed above are different: they are currently separate curated or generated commands that should become nested command groups.

## Goals

- Replace the selected flat command names with nested command forms:
  - `spacemolt citizenship <action>`
  - `spacemolt facility <action>`
  - `spacemolt faction <action>`
  - `spacemolt fleet <action>`
  - `spacemolt forum <action>`
  - `spacemolt station <action>`
  - `spacemolt trade <action>`
- Remove the old flat command names entirely from dispatch, help, search, and completion.
- Keep each nested action using the same route, schema, aliases, positionals, rendering, ID resolution, and dry-run behavior as the flat command it replaces.
- Keep dynamic generated commands compatible with grouping when cached OpenAPI metadata adds more commands under one of the grouped prefixes.
- Preserve unrelated top-level commands such as `create_faction`, `create_fleet`, `get_faction_achievements`, and `list_station_passengers`.

## Non-Goals

- Do not add hidden compatibility aliases for removed flat names.
- Do not merge these groups into a single `storage`-style action command that changes payload shape.
- Do not rename server routes or regenerate OpenAPI metadata for this change.
- Do not restructure unrelated command categories.
- Do not remove commands that merely contain the group word but do not start with one of the exact grouped prefixes.

## Command Surface

These examples show the intended user-facing shape:

```text
spacemolt citizenship apply solarian
spacemolt citizenship list
spacemolt facility build ore_refinery
spacemolt facility job_add facility-1 refine_steel 12
spacemolt faction info
spacemolt faction create_buy_order ore_iron 100 12
spacemolt fleet invite PlayerName
spacemolt forum get_thread thread-1
spacemolt station set_name "Aurora Freeport"
spacemolt trade offer player-1 credits=500
```

The old flat forms should become unknown commands:

```text
spacemolt citizenship_apply solarian
spacemolt facility_build ore_refinery
spacemolt faction_info
spacemolt fleet_invite PlayerName
spacemolt forum_get_thread thread-1
spacemolt station_set_name "Aurora Freeport"
spacemolt trade_offer player-1 credits=500
```

Action names are the suffix after the group prefix. For example:

- `faction_create_buy_order` becomes `faction create_buy_order`
- `facility_job_reorder` becomes `facility job_reorder`
- `station_set_service_access` becomes `station set_service_access`

## Architecture

Add a small command-group metadata layer that describes exact grouped prefixes:

```text
citizenship_ -> citizenship
facility_    -> facility
faction_     -> faction
fleet_       -> fleet
forum_       -> forum
station_     -> station
trade_       -> trade
```

Build the command registry with three separate views:

- `commands`: executable API commands keyed only by accepted top-level command names.
- `allCommands`: user-visible commands for help, search, completion, and local command discovery.
- `commandGroups`: internal group metadata keyed by group name, with actions mapped to the original command config and route.

The grouped command registry should omit flat names for grouped commands from `commands` and `allCommands`. It should expose group entries in `allCommands`, and it should expose action configs only through `commandGroups`.

Internally, dispatch can still keep the original flat execution key as metadata for rendering or legacy route-specific helpers. That internal key is an implementation detail stored under the group action; it must not be accepted as a user-facing command or be reachable through normal `commands[name]` lookup.

## Parsing And Dispatch

When the first argv token is one of the configured groups, dispatch should:

1. Require a second token for the action, unless the user asks for group help.
2. Resolve `group action` through `commandGroups[group].actions[action]`.
3. Parse the remaining argv with that action's original command config, but with the visible command name set to `group action` for help and errors.
4. Run the original route config and renderer.

For example:

```text
spacemolt faction create_buy_order ore_iron 100 12
```

should parse using the `faction_create_buy_order` config and execute the same route as before.

If the user types a removed flat command such as `faction_create_buy_order`, `resolveHandler` should not create an API handler for it. It should fall through to the existing unknown-command path.

If the user types an unknown nested action such as `spacemolt faction typo`, the CLI should report an unknown command/action and show a useful group-oriented hint.

## Help And Search

Help should advertise nested forms only:

- `spacemolt help faction` should show faction group actions.
- `spacemolt faction help` and `spacemolt faction --help` should show the same group help.
- `spacemolt help faction create_buy_order` should show command-level help for the nested action.
- `spacemolt commands faction buy` should search nested display names and descriptions.
- `spacemolt explain faction create_buy_order` should work for nested actions.

Search and full help should not list removed flat command names. If a route, test fixture, or renderer needs the legacy key internally, user-facing output should prefer the nested display name.

## Completion

Runtime completion should be the primary behavior:

- Top-level completion should include `citizenship`, `facility`, `faction`, `fleet`, `forum`, `station`, and `trade`.
- Top-level completion should exclude grouped flat names.
- Completing after a group should list only that group's actions.
- Completing after a group action should use the original command's argument completion metadata.
- Cached ID completion should work for nested actions exactly as it worked for their flat command configs.

Static shell fallback scripts for bash, zsh, and fish should follow the same shape:

- Include group names as top-level command words.
- Exclude grouped flat command words.
- Include per-group action completions.
- Include per-action argument completions where the existing static completion generator can support them.

## Dynamic Generated Commands

The dynamic command builder should apply the same grouping rule after it creates generated command names. A dynamically generated `faction_new_action` should be exposed as `faction new_action` when the route is safe and not curated.

Grouping must still respect existing suppression rules:

- Hidden generated routes remain hidden.
- Help routes remain hidden.
- Routes suppressed because they are covered by curated commands remain hidden.
- Command-name collisions should be resolved before exposing the action.

## Error Handling

Missing action:

```text
spacemolt faction
```

should show group help or an actionable missing-action error.

Unknown action:

```text
spacemolt faction made_up
```

should fail without contacting the API.

Removed flat command:

```text
spacemolt faction_info
```

should be an unknown command and should not be rewritten into `faction info`.

Validation errors inside a nested action should still use the original schema and aliases. Error text should prefer the nested display name where practical, but preserving existing schema field messages is acceptable.

## Testing

Write tests first.

Focused tests:

- Registry tests proving grouped flat commands are omitted from `commands` and `allCommands`.
- Registry tests proving group entries exist and contain the expected actions.
- Parser or handler tests proving `group action` dispatches to the original route config.
- Handler tests proving removed flat commands are unknown and do not create API handlers.
- Argument tests for representative nested commands:
  - `citizenship apply`
  - `facility job_add`
  - `faction create_buy_order`
  - `fleet invite`
  - `forum get_thread`
  - `station set_name`
  - `trade offer`
- Runtime completion tests proving top-level groups appear, flat names do not appear, group actions complete, and nested action arguments complete.
- Static completion tests for bash, zsh, and fish proving top-level and action lists match the new shape.
- Help/search/explain tests proving nested names are displayed and flat names are absent.
- ID resolver or completion tests for at least one nested item/player/station/faction action.

Verification:

```bash
~/.bun/bin/bun test src/args.test.ts
~/.bun/bin/bun test src/local-command-handlers.test.ts
~/.bun/bin/bun test src/completion.test.ts
~/.bun/bin/bun test src/command-metadata.test.ts
~/.bun/bin/bun test src/help.test.ts
~/.bun/bin/bun test src/runner.test.ts
~/.bun/bin/bun run typecheck
```

Run the full test suite if focused verification passes and the implementation changes shared registry or command handler behavior broadly.

## Acceptance Criteria

- The only accepted forms for the selected commands are nested `group action` forms.
- Old flat names under the selected prefixes are unknown commands.
- Top-level completions are shorter because grouped flat names are absent.
- Group action completions and argument completions work for runtime completion and static fallback scripts.
- Help, search, and explain show nested command names.
- Existing route execution and payload behavior is preserved for each nested action.
