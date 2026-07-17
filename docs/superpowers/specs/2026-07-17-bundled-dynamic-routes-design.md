# Bundled Dynamic Routes by Default — Design

**Status:** Approved for implementation planning
**Date:** 2026-07-17

## Problem

The CLI bundles generated route and request metadata from the reviewed OpenAPI spec, but it currently excludes generated fallback commands from the default command registry. A generated command becomes visible only after the user runs `spacemolt sync-api` and the runtime accepts the cached OpenAPI metadata.

This creates an unnecessary gap for routes that are already embedded in a released CLI. In v0.522.0, for example, the CLI contains complete metadata for eleven shipping actions, but a clean installation reports `shipping_quote` as unknown until the user refreshes the runtime cache.

The bundled metadata is immutable for a given CLI release and receives the same API-sync and generation checks as curated command metadata. It is therefore a stronger trust source than a separately downloaded runtime cache and should be usable without an additional network operation.

## Goals

- Expose every safe generated command from bundled OpenAPI metadata on a clean installation.
- Make bundled generated commands available consistently through parsing, dispatch, help, command search, explanation, and shell completion.
- Preserve curated commands as the preferred interface whenever a curated command name or API route overlaps generated metadata.
- Continue allowing a valid same-version or newer OpenAPI cache to replace the generated fallback surface with the server's current route catalog.
- Continue rejecting invalid and older cached metadata for runtime command exposure.
- Keep all existing generated-route safety suppressions.

## Non-goals

- Curating shipping commands or adding shipping-specific aliases, examples, formatters, or golden fixtures.
- Changing generated command naming, usage construction, request conversion, or response rendering.
- Exposing help, session, hidden, or explicitly suppressed storage routes.
- Making runtime OpenAPI synchronization automatic.
- Removing curated commands at runtime when a newer server spec no longer contains their routes. Curated-route reconciliation remains a release-time API-sync responsibility.

## Decision

Bundled OpenAPI metadata is a release-reviewed command source. The default bundled registry will include all routes accepted by the existing generated-route safety policy.

At runtime, the generated fallback source is selected as follows:

1. With no valid cache, use bundled generated routes.
2. With an older or invalid cache, ignore the cache and use bundled generated routes.
3. With a cache whose gameserver version is equal to or newer than the bundled gameserver version, use cached routes as the authoritative generated fallback catalog.

The cache is authoritative only for generated fallback visibility. Curated command construction may continue using the merged bundled-plus-cache metadata so a newer schema can enrich or update a curated route. Using the cache alone for generated visibility is important: if a newer server removes a formerly bundled generated route, that route must disappear after `sync-api` instead of surviving because of a union merge.

## Safety Invariants

The existing `shouldExposeGeneratedRoute` policy remains the single exposure gate. Generated fallback commands must not be created when any of these conditions apply:

- The route signature is in `SUPPRESSED_GENERATED_ROUTE_SIGNATURES`.
- OpenAPI marks the route with `x-cli-hidden`.
- The signature or action is a help route.
- The route belongs to the session tool.
- A curated command already owns the generated command name.
- A curated command already owns the API route signature.
- Another generated route has already claimed the normalized command name.

No new allowlist is introduced. Future bundled routes become available only after they enter a reviewed CLI release and pass these filters.

## Architecture and Data Flow

### Clean installation

```text
GENERATED_API_ROUTES
  -> generated-route safety filter
  -> generated fallback commands
  -> curated commands overwrite/preempt conflicts
  -> grouping
  -> help, search, completion, parsing, and dispatch
```

`BUNDLED_COMMAND_REGISTRY` will be built with generated fallback commands enabled. Code paths that use this registry directly will therefore see the same bundled command surface as a normal invocation without a cache.

### Valid same-version or newer cache

```text
bundled routes + cached routes
  -> merged metadata for curated command schemas

cached routes only
  -> generated-route safety filter
  -> generated fallback command visibility

curated + generated
  -> grouping and runtime registry
```

Cached records override matching bundled records in the merged metadata. Generated fallback visibility comes from the cache alone, allowing additions, removals, hidden flags, and schema changes in the authoritative cached catalog to take effect.

### Invalid or older cache

The cache contributes neither schemas nor generated command visibility. Runtime behavior is identical to a clean installation using bundled metadata.

## Component Changes

### Command registry

- Build `BUNDLED_COMMAND_REGISTRY` with safe generated commands enabled.
- Retain `buildCommandRegistrySnapshot` options so tests and specialized callers can deliberately restrict the generated source.
- Keep curated command and curated route precedence unchanged.

### Runner

- Always enable generated fallback construction.
- Select bundled routes as `dynamicGeneratedRoutes` when no usable cache exists.
- Select cached routes as `dynamicGeneratedRoutes` when an equal/newer cache exists.
- Continue passing merged bundled-plus-cache routes as `generatedRoutes` for curated schema construction.
- Preserve the current cache version comparison and stale-cache rejection behavior.

### Help and completion

No special-case shipping integration is needed. Once the bundled registry contains generated commands, existing help, command search, explanation, static shell completion, and runtime completion paths will discover them through the normal registry interfaces.

Generated commands remain grouped under the existing `Generated API` category.

### Doctor diagnostics

Doctor output should distinguish bundled availability from cache extension. Its OpenAPI diagnostic will continue reporting the cached route count, but the dynamic-command detail should be labeled as cache-provided commands and should use the same cache-version acceptance rule as the runner. A clean installation having bundled generated commands is healthy and must not imply that `sync-api` is required.

### Documentation

README wording will state that:

- Reviewed generated fallback commands bundled with the CLI are available immediately.
- `spacemolt sync-api` refreshes metadata so a running CLI can discover safe routes published after that CLI release.
- Curated commands continue to provide the friendliest names, examples, and formatting.

## Error Handling and Compatibility

- Missing, unreadable, versionless, or non-object cache files fall back silently to bundled generated routes, matching current cache-read behavior. Deep validation of individual cached route records is unchanged and outside this feature's scope.
- Older caches cannot hide, replace, or add commands.
- A valid equal/newer cache may remove a bundled generated command because its route catalog is authoritative for generated visibility.
- Generated commands continue using existing request validation and output paths. Server errors remain normal API errors; no fallback routing is introduced.
- Existing curated commands, aliases, grouped commands, and local commands retain precedence and behavior.

The user-visible additive change is that clean installations gain safe generated commands in help, search, completion, and dispatch. Scripts using curated commands are unaffected.

## Testing Strategy

### Registry policy

- Assert that the bundled registry includes the eleven current shipping commands.
- Assert that bundled help, session, hidden, and explicitly suppressed routes remain absent.
- Assert that curated names and curated route signatures still preempt generated commands.

### Clean-profile runtime

With an empty temporary `XDG_CONFIG_HOME`:

- `help shipping_quote` resolves successfully.
- `commands --search shipping_quote` finds the command.
- Completion suggests `shipping_quote` and its schema-backed arguments.
- A dry run parses required fields and reports the expected shipping route without sending a request.
- Dispatch sends the expected route and converted payload through a fake client.

### Cache behavior

- A same-version or newer cache can add a generated route.
- A same-version or newer cache can remove a bundled generated route from visibility.
- Cached metadata overrides a matching bundled generated schema.
- An older, invalid, or absent cache leaves the bundled generated surface intact.
- A stale cache cannot reintroduce a removed route.

### Diagnostics and regression gates

- Doctor reports cached routes and cache-provided dynamic commands without implying bundled commands require synchronization.
- Existing command metadata, grouping, help, completion, runner, API-sync, full test, typecheck, lint, and build checks pass.

## Expected Files

Primary implementation changes are expected in:

- `src/command-registry.ts`
- `src/runner.ts`
- `src/doctor.ts`
- `README.md`

Focused test changes are expected in:

- `src/command-metadata.test.ts`
- `src/runner.test.ts`
- `src/doctor.test.ts`
- Relevant help/completion tests if existing registry assertions do not already cover the clean bundled surface

No generated metadata, command overrides, response formatters, or golden output files should need modification.

## Acceptance Criteria

- A clean installation recognizes and dispatches every bundled route that passes the existing generated-route safety filter.
- `shipping_quote` works without first running `spacemolt sync-api`.
- Help, search, explanation, and completion present the same bundled generated command surface as dispatch.
- Curated commands continue to win all name and route conflicts.
- Equal/newer caches authoritatively control generated fallback visibility; older and invalid caches are ignored.
- All suppressed route classes remain inaccessible as generated commands.
- Documentation accurately distinguishes bundled generated commands from cache-discovered additions.
