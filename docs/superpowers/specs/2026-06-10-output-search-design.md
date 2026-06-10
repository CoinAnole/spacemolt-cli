# Output Search Design

## Summary

Add global output search flags that scan structured command output and print matching jq-compatible paths with their values. The feature is meant to answer "where is this field or value?" while also teaching the exact `--jq` path to reuse.

Dashed search flags are global output projections. Existing command payload forms such as `search=fuel` remain command arguments and keep their current API/filter behavior.

## Goals

- Support `--search PATTERN` for recursive key and scalar value matching.
- Support `--search-keys PATTERN` for recursive key-name matching only.
- Support `--search-values PATTERN` for recursive scalar value matching only.
- Support `--search-regex PATTERN` to interpret active search patterns as regular expressions.
- Print one match per line as `<jq-path> = <value>`.
- Let `--jq` scope the search to a subtree before matching.
- Keep output easy to read and directly reusable in `--jq`.

## Non-Goals

- Do not change command payload parsing for `search=...`.
- Do not add server-side search behavior.
- Do not implement full jq syntax beyond the existing evaluator.
- Do not add fuzzy search matching for output search in this iteration.

## User Experience

Examples:

```text
$ spacemolt get_ship --search fuel
.ship.fuel = 13
.ship.max_fuel = 700

$ spacemolt get_status --search hull
.ship.hull = 480
.ship.max_hull = 480
.ship.armor = 0

$ spacemolt get_status --jq '.ship' --search fuel
.fuel = 13
.max_fuel = 700
```

Substring matching is case-insensitive. Regex matching is also case-insensitive and reports an error for invalid patterns.

When a key match points at an object or array, print compact JSON for that value. Scalar values print as plain strings, numbers, booleans, or `null`. Array paths use jq-compatible indexes, such as `.items[0].name`.

## Architecture

Add the new flags to `GlobalOptions` and parse them in `src/global-options.ts`. Parser-supported flags should also be added to shell completion metadata and global help.

Render output search as a projection in `src/display/index.ts`, beside the existing `--jq`, `--field`, `--fields`, and `--keys` logic. Search should operate on `normalizeStructuredResultForOutput(command, result)`, which is already the data shape used by projections.

Projection precedence:

1. `--keys` remains mutually exclusive with `--jq`.
2. If `--jq` and output search are both present, evaluate `--jq` first.
3. Search the resulting subtree and root emitted paths at `.` for that subtree.
4. If no output search is present, preserve existing projection behavior.

This keeps `--jq '.ship' --search fuel` scoped and produces `.fuel`, not `.ship.fuel`.

## Search Semantics

Traverse arrays and plain objects recursively. For each object property:

- key matching tests the property name.
- value matching tests scalar property values after string conversion.
- `--search` enables both key and value matching.
- `--search-keys` enables key matching for its pattern.
- `--search-values` enables value matching for its pattern.
- Multiple search flags are additive; any active matcher can emit a line.

Avoid duplicate output lines when the same path is matched by multiple active modes. Preserve traversal order from the source object.

Root scalar searches are allowed after `--jq` scopes to a scalar. The emitted path is `.`.

## Error Handling

If a regex pattern is invalid, print a normal CLI error and exit nonzero. If `--jq` fails while scoping a search, use the existing jq error path and exit nonzero.

No matches is a successful empty result. This matches common command-line search behavior and avoids making scripts handle "not found" as an execution failure.

## Testing

Use TDD. Add focused tests for:

- parsing each new global flag, including `--flag value` and `--flag=value` forms.
- missing values for each search flag.
- substring search across keys and values.
- keys-only and values-only matching.
- regex matching and invalid regex failure.
- `--jq` scoping before search.
- array paths using bracket indexes.
- duplicate suppression when multiple match modes hit the same path.
- help and completion metadata include the new flags.

Add golden output cases only if the existing golden harness is the most direct place to lock end-user rendering. Otherwise, focused renderer tests are sufficient.
