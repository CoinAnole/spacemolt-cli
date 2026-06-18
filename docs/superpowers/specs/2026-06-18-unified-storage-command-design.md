# Unified Storage Command Design

## Context

The SpaceMolt API now exposes unified storage endpoints under `spacemolt_storage`, but the CLI still presents several older storage-specific command names:

- `view_storage`
- `view_faction_storage`
- `deposit_items`
- `withdraw_items`
- `send_gift`
- `storage_loot`
- `storage_jettison`

This split makes storage behavior harder to discover because viewing, moving, gifting, looting, and jettisoning are spread across separate commands. The CLI already has a curated `storage` command, but it only exposes `deposit`, `loot`, and `jettison` through an `action=` payload field.

## Goals

- Make `storage` the single curated command for station storage operations.
- Support direct sub-action syntax: `spacemolt storage <action> ...`.
- Preserve existing direct Cargo and Salvage commands that are not legacy storage wrappers.
- Remove the legacy storage command names from the curated command registry, help, search, and completions.
- Keep the already-supported `storage action=<action> ...` form working.
- Keep existing formatting, filtering, ID resolution, and dry-run behavior for the unified storage command.

## Non-Goals

- Do not remove standalone Cargo `jettison`.
- Do not remove standalone Salvage/Wreck commands such as `loot_wreck` and `salvage_wreck`.
- Do not add hidden compatibility aliases for removed storage command names.
- Do not change the server API contract or regenerate OpenAPI metadata.

## Command Surface

The CLI should advertise these storage forms:

```text
spacemolt storage view [station_id] [target=self|faction] [--item item_id] [--items item_id,item_id] [--search text]
spacemolt storage deposit <item_id> [quantity] [target=self|faction|player] [source=cargo|storage|faction] [message=...]
spacemolt storage withdraw <item_id> [quantity] [target=self|faction] [source=cargo|storage|faction]
spacemolt storage loot [wreck_id] [item_id] [quantity] [module_id=...]
spacemolt storage jettison <item_id> [quantity]
```

The CLI should also continue accepting the existing unified payload form:

```text
spacemolt storage action=view target=faction
spacemolt storage action=deposit item_id=iron_ore quantity=50
spacemolt storage action=withdraw item_id=iron_ore quantity=50
spacemolt storage action=loot wreck_id=wreck_1 item_id=iron_ore quantity=2
spacemolt storage action=jettison item_id=iron_ore quantity=2
```

These commands remain standalone and are not part of the storage cleanup:

```text
spacemolt jettison <item_id> <quantity>
spacemolt loot_wreck <wreck_id> <item_id> [quantity]
spacemolt salvage_wreck <wreck_id>
```

## Removed Commands

These command names should become unknown commands:

- `view_storage`
- `view_faction_storage`
- `deposit_items`
- `withdraw_items`
- `send_gift`
- `storage_loot`
- `storage_jettison`

The removal is intentional. The CLI should not keep hidden aliases or compatibility shims for them.

## Parsing And Routing

The `storage` command should treat the first positional argument as `action` when it is one of:

- `view`
- `deposit`
- `withdraw`
- `loot`
- `jettison`

For example:

```text
spacemolt storage view nexus_base target=faction
```

should parse to:

```json
{
  "action": "view",
  "station_id": "nexus_base",
  "target": "faction"
}
```

Routing should use the resolved action:

- `view` -> `POST /api/v2/spacemolt_storage/view`
- `deposit` -> `POST /api/v2/spacemolt_storage/deposit`
- `withdraw` -> `POST /api/v2/spacemolt_storage/withdraw`
- `loot` -> `POST /api/v2/spacemolt_storage/loot`
- `jettison` -> `POST /api/v2/spacemolt_storage/jettison`

The current `storage action=<action>` behavior should route the same way.

If no action is supplied, the command should continue using the existing default route behavior for compatibility with the current curated command. Help text should make the action requirement clear.

## Targets And Transfer Semantics

`storage view` should replace both old view commands:

- `storage view` defaults to `target=self`.
- `storage view target=faction` replaces `view_faction_storage`.
- `station_id` remains optional and is only meaningful for viewing.

`storage deposit` should replace old deposit and gift commands:

- `target=self` or omitted: cargo to personal station storage.
- `target=faction`: cargo to faction storage, or `source=storage` for personal storage to faction storage.
- `target=<player>`: gift to another player.
- `source=faction target=self`: faction storage to personal storage transfer when permitted.
- `message` remains available for gifts.

`storage withdraw` should replace old withdrawal commands:

- Default target is personal storage to cargo.
- Faction-related transfers use `target` and `source` consistently with the API schema.

`storage loot` and `storage jettison` remain available under `storage` because the server exposes them there, but the CLI should also keep the older domain-specific standalone commands where they are not storage wrappers.

## Rendering And Filtering

Storage view filtering should keep existing behavior:

- `--item` maps to `item_id`.
- `--items` is a client-side comma-separated exact item filter.
- `--search` is a client-side search filter.
- Filtering applies to text, JSON, and structured output.

Rendering should key off the effective storage action and target rather than removed command names. Faction storage display behavior should continue when `command=storage`, `action=view`, and `target=faction`.

Carrier bay load display behavior currently tied to `deposit_items` should move to the unified storage context when `command=storage`, `action=deposit`, and the response indicates carrier bay loading.

## ID Resolution

ID resolver behavior should move from removed commands to `storage`:

- `storage view <station_id>` resolves station/POI aliases for `station_id`.
- `storage deposit <item_id>` resolves cached item aliases for `item_id`.
- `storage withdraw <item_id>` resolves cached item aliases for `item_id`.
- Existing reserved item IDs such as `fuel` remain reserved.
- `send_gift` recipient-specific handling should be transferred to `storage deposit target=<recipient>` where applicable.

Standalone Cargo and Salvage ID resolution should remain unchanged:

- `jettison` resolves cargo item aliases.
- `loot_wreck` and `salvage_wreck` keep their existing wreck/item behavior.

## Help, Search, And Completion

Help and command search should advertise `storage` as the unified storage entry point and should stop listing removed commands.

The storage help group should show:

- storage view
- storage deposit
- storage withdraw
- storage loot
- storage jettison
- standalone `jettison` for Cargo disposal
- standalone `loot_wreck` and `salvage_wreck` for Wreck/Salvage workflows

Completion should expose valid fields for `storage`, including:

- `action=`
- `target=`
- `source=`
- `item_id=`
- `quantity=`
- `station_id=`
- `wreck_id=`
- `module_id=`
- `message=`
- `items=`
- `search=`

Completion should not expose removed command names.

## Tests

Update tests first to capture the new behavior:

- Parser tests for `storage view`, `storage deposit`, `storage withdraw`, `storage loot`, and `storage jettison`.
- Parser tests proving `storage action=<action>` still works.
- Validation tests proving removed command names are no longer bundled curated commands.
- Dry-run routing tests proving each storage action routes to the matching `spacemolt_storage/<action>` endpoint.
- Help/search/completion tests proving removed command names are gone and unified `storage` guidance is present.
- Renderer tests proving storage view filtering works through `storage view`.
- Renderer tests proving faction storage display still works through `storage view target=faction`.
- Renderer tests proving carrier bay load specialization works through `storage deposit`.
- ID resolver tests for storage station/item/recipient behavior.
- Golden output updates for intentional command-name/help/output changes.

Routine verification should use the cached OpenAPI spec:

```bash
bun test src/args.test.ts
bun test src/cli-local.test.ts
bun test src/runner.test.ts
bun test src/response-renderer.test.ts
bun test src/formatter.test.ts
bun test src/help.test.ts
bun test src/completion.test.ts
bun test src/id-resolver.test.ts
bun test src/command-metadata.test.ts
bun test src/output-golden.test.ts
bun test src/api-sync.test.ts
bun run typecheck
```

Live OpenAPI verification is not required for this change.

## Rollout Notes

This is an intentional breaking CLI cleanup. Users of removed storage command names must migrate to `storage <action>`:

- `view_storage [station_id]` -> `storage view [station_id]`
- `view_faction_storage [station_id]` -> `storage view [station_id] target=faction`
- `deposit_items <item_id> <quantity>` -> `storage deposit <item_id> <quantity>`
- `withdraw_items <item_id> <quantity>` -> `storage withdraw <item_id> <quantity>`
- `send_gift <recipient> ...` -> `storage deposit target=<recipient> ...`
- `storage_loot ...` -> `storage loot ...`
- `storage_jettison ...` -> `storage jettison ...`
