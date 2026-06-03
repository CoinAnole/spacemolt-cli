# Global Output State Removal Design

## Goal

Remove the legacy mutable runtime/output globals from the SpaceMolt CLI without breaking current CLI behavior, exact golden output, or the public configuration API that package consumers may already use.

The removal should happen in two parts:

- Part 1: rename and contain the global-backed compatibility layer.
- Part 2: replace global reads and writes with explicit runtime context, then remove the globals.

## Current State

`src/runtime.ts` owns both durable runtime constants and mutable process-wide output state. The mutable state is:

- `JSON_OUTPUT`
- `DEBUG`
- `PLAIN`
- `QUIET`
- `FORMAT`
- `COMPACT`

`LegacySpaceMoltConfig` reads those globals dynamically and is the default source for `createRuntimeState()` and `createDefaultConfig()`. `setOutputMode()` mutates the globals from CLI parsing paths.

Newer CLI flows already build an explicit `SpaceMoltConfig` through `getRuntimeConfig()` and pass it through `CliRuntimeContext`, command handlers, renderers, and `SpaceMoltClient`. However, several paths still depend on global state:

- Early global-option parse errors in `runner.ts`, before full config resolution.
- Direct runner error/debug output using `runtime.c`, `DEBUG`, and `API_BASE`.
- `applyGlobalOptions()` mutating output globals.
- Session and update debug output reading `DEBUG` and `c`.
- ID-cache suggestions reading `QUIET` and `c`.
- Runtime table/color helpers that close over `PLAIN`.
- Tests that assert the legacy globals remain mutable for compatibility.

## Non-Goals

Part 1 does not remove globals or change runtime behavior.

Part 2 does not change command routing, output formats, profile resolution, session file layout, OpenAPI generation, or renderer semantics. Any output changes must be intentional and covered by golden updates.

This design does not remove `createDefaultConfig()` or `createRuntimeState()`. They remain the public configuration API.

## Part 1: Rename and Contain the Compatibility Layer

Part 1 makes the current mechanism honest and reduces the public surface area without changing behavior.

### API Shape

Rename `LegacySpaceMoltConfig` to `GlobalBackedConfig` in `src/runtime.ts`.

Keep a deprecated alias:

```ts
export const LegacySpaceMoltConfig = GlobalBackedConfig;
```

This preserves existing imports from the package entrypoint while moving internal code and tests to the clearer name.

`createRuntimeState()` should default to `new GlobalBackedConfig()`.

`createDefaultConfig()` should continue returning a config object backed by `GlobalBackedConfig` plus optional overrides. This preserves the existing dynamic behavior where unset fields reflect current global output state.

### Export Policy

Keep exporting `createDefaultConfig`, `createRuntimeState`, `SpaceMoltConfig`, and the deprecated `LegacySpaceMoltConfig` alias.

Export `GlobalBackedConfig` from the package entrypoint so new consumers have a non-legacy name.

Do not remove or hide `setOutputMode()` in Part 1. It is still used by internal CLI parsing and test setup. Mark it as an internal compatibility bridge in comments or docs rather than pretending it is obsolete.

### Tests

Update `config.test.ts` names and assertions:

- `GlobalBackedConfig resolves globals dynamically`
- `global-backed output state remains mutable while compatibility bridge exists`

Keep coverage that proves `createRuntimeState(config)` does not read globals when an explicit config is supplied.

Run:

```bash
bun test src/config.test.ts src/runner.test.ts
```

If exports change, also run:

```bash
bun run typecheck
```

## Part 2: Thread Explicit Runtime State and Remove Globals

Part 2 removes process-wide output state after all remaining consumers can use explicit config/context.

### Runtime State Model

Introduce a small explicit output state type if the existing `SpaceMoltConfig` is too broad for early parse errors:

```ts
interface OutputRuntimeState {
  jsonOutput: boolean;
  debug: boolean;
  plain: boolean;
  quiet: boolean;
  format: 'table' | 'json' | 'yaml' | 'text';
  compact: boolean;
}
```

Use this for parse-error rendering before profile/default config resolution is complete. Once full global options are parsed, continue using `SpaceMoltConfig` through `CliRuntimeContext`.

### Color and Formatting

Move process-global color helpers toward explicit `plain` state:

- Prefer the existing buffered display helpers for structured renderers.
- Add small helper factories for direct output paths, such as `colorsForPlain(plain)` or `formatPlayerWithPlain(player, plain)`.
- Replace imports of `runtime.c`, `colorize`, `hexColor`, `formatPlayer`, `printItemTable`, and `printCompactTable` in non-runtime modules with explicit-context equivalents.

Runtime constants such as `DEFAULT_V2_API_BASE`, `VERSION`, timeout/retry constants, and update-check constants can stay in `runtime.ts` or move to a constants module. They are not part of the mutable-state removal.

### CLI Parsing and Runner Flow

Change `parseInvocation()` and `applyGlobalOptions()` so parsing returns data instead of mutating process state.

Early parse-error flow should derive an `OutputRuntimeState` from the parse error and environment, then render with explicit colors:

1. Parse global options.
2. If parsing fails, derive output state from parse-error flags and env.
3. Render JSON or plain/table error from that output state.
4. Return exit code without mutating globals.

Successful invocation flow should:

1. Parse global options.
2. Resolve default or explicit profile.
3. Build `SpaceMoltConfig` with `getRuntimeConfig()`.
4. Attach config to `CliRuntimeContext`.
5. Pass context/config to client, command handlers, update checks, ID-cache suggestions, and renderers.

### Remaining Consumers

Replace each global consumer with explicit state:

- `runner.ts`: use `context.config.debug`, `context.config.plain`, and `context.config.apiBase` for connection errors, debug dumps, and watch messages.
- `global-options.ts`: parse and normalize options only; remove output mutation.
- `session.ts`: use constructor-injected `debug`, `apiBase`, and explicit plain-aware colors for messages.
- `update.ts`: use the existing `checkForUpdates()` options/context path instead of defaulting to `DEBUG`.
- `id-cache.ts`: pass `quiet`, `plain`, and writer into suggestion rendering.
- Tests: replace direct global assertions with config/context assertions.

After these replacements, remove:

- Mutable output globals.
- `setOutputMode()`.
- `GlobalBackedConfig`.
- Deprecated `LegacySpaceMoltConfig` alias.
- Default no-argument `createRuntimeState()` behavior, unless it can be backed by an immutable env snapshot.

`createDefaultConfig()` should remain, but in Part 2 it should return an immutable config snapshot seeded from environment variables and supplied overrides.

## Compatibility and Release Strategy

Part 1 is backward-compatible and can ship in a minor release.

Part 2 is a breaking internal architecture change and may also be a public API break if external consumers import mutable globals, `setOutputMode()`, or `LegacySpaceMoltConfig`. Before Part 2, audit package exports and decide whether to:

- Keep deprecated aliases for one release with immutable behavior.
- Remove them in a major release.
- Leave them unexported from `src/client.ts` while preserving internal modules.

The CLI behavior must remain unchanged for ordinary command execution.

## Error Handling

No user-facing error text should change as part of the migration unless a test explicitly records the intended new output.

Early parse errors must preserve:

- JSON error output when `--json`, `--format=json`, or `SPACEMOLT_OUTPUT=json` applies.
- Plain/no-color output when `--plain` appears before the parse error.
- Debug behavior from `--debug` or `DEBUG=true`.

Connection errors must continue to print the effective API base URL in troubleshooting output.

## Testing

Part 1 focused tests:

```bash
bun test src/config.test.ts src/runner.test.ts
bun run typecheck
```

Part 2 should use focused TDD per migrated area:

- Runner parse-error tests for JSON, plain, debug, and invalid option output.
- Runner connection-error tests for debug and API base output.
- Session tests for debug output without reading globals.
- Update tests for injected debug behavior.
- ID-cache tests for quiet/plain suggestion output.
- Config tests proving default config is an env-backed snapshot.

Then run:

```bash
bun test src/output-golden.test.ts
bun test
bun run typecheck
```

If output changes are intentional, update only the affected golden files with targeted `GOLDEN_ONLY=... UPDATE_GOLDENS=1` runs.

## Open Decisions

Before implementing Part 2, decide whether removal of `LegacySpaceMoltConfig`, `GlobalBackedConfig`, and `setOutputMode()` is a major-version change. If external package consumers are not considered supported for those names, remove them from the entrypoint first and keep the internal migration separate.

Decide whether `createRuntimeState()` should keep a no-argument overload. Keeping it requires an env-backed default snapshot. Removing it makes runtime state fully explicit but may be a package API break.
