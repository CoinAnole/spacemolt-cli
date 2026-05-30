# Curated Command Divergence Report Design

## Goal

Add an informational report, similar to `bun run report:fixture-schemas`, that compares each curated command override against the command config the OpenAPI-generated metadata would produce for that same route.

## Scope

The report only covers routes that are already curated in `COMMAND_OVERRIDES`. It does not list generated commands for uncurated OpenAPI routes.

## Architecture

Create a focused comparison module under `src/test-support/` and a thin script under `scripts/`. The module will accept curated overrides and generated route metadata, derive a would-be generated command config using the same naming, argument, usage, and schema conventions as dynamic commands, then emit structured differences. The script will parse `--only`, call the module with bundled metadata, format a human-readable report, and remain diagnostic only.

## Comparison Fields

For each curated command:

- Compare the curated command name with the generated command name for its `apiRoute`.
- Compare `args`, `required`, `usage`, `description`, `category`, `route`, and route `defaults`.
- Compare schema field presence and schema metadata including `type`, `enum`, `description`, and `positionalIndex`.
- Report missing generated metadata when a curated override references a route not present in generated metadata.

## Output

The default report should be stable, text-based, and easy to scan. It should include a command count, one section per matching curated command, a summary line, grouped differences, and a short legend. `--only` should accept comma-separated filters and match curated command names or generated command names by substring.

## Testing

Use TDD. Add unit tests for the comparison module with small fake curated overrides and generated routes. Cover no-difference, name difference, config differences, schema field differences, missing generated route, and `--only` filtering. Add the npm script entry after the comparison behavior is tested.
