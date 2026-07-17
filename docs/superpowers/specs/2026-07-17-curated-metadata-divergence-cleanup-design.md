# Curated Metadata Divergence Cleanup Design

## Problem

`bun run report:curated-commands` currently reports several curated/generated metadata differences as actionable. Most are intentional CLI behavior, but the `craft` and `recycle` positional differences are especially noisy because runtime parsing is already correct.

The specific issue is that curated `schemaExtensions` replace generated schema field objects during command config merge. When a curated field only wants to improve a description or add CLI-specific detail, it can accidentally drop generated metadata such as `positionalIndex`.

For example:

- Generated OpenAPI metadata says `id` is positional 0 and `quantity` is positional 1.
- Curated command UX says `recipe_id` is positional 0 and `quantity` is positional 1.
- Merge-time alias generation maps `recipe_id -> id`.
- Runtime parsing uses curated `config.args`, then alias normalization maps the payload to the API wire field.
- The divergence report compares the merged schema fields and sees missing `schema.id.positionalIndex` / `schema.quantity.positionalIndex`.

The parser behavior is correct. The report and merge behavior are too literal for curated UX metadata.

## Goals

- Keep curated command parsing controlled by `config.args`.
- Keep generated fallback command parsing controlled by generated schema positional metadata.
- Preserve generated field metadata when curated schema extensions only override part of a field.
- Make the curated/generated report distinguish alias-equivalent positionals from real positional contract drift.
- Keep true schema-contract differences visible, including intentionally curated fields such as `craft.action`.

## Non-Goals

- Do not change runtime parsing to use `schema.*.positionalIndex` for curated commands.
- Do not change user-facing `craft` or `recycle` help from `recipe_id` to `id`.
- Do not remove `recipe_id -> id` alias behavior.
- Do not add broad report suppressions that hide unrelated positional drift.
- Do not solve notification enum or OpenAPI query-parameter divergences in this change; those are separate metadata-contract issues.

## Design

### Preserve generated schema field metadata

Change command config merge so schema extensions are applied field-by-field over generated schema fields instead of replacing the whole field object.

Conceptually:

```ts
const schema = {
  ...generated.schema,
  ...Object.fromEntries(
    Object.entries(schemaExtensions).map(([field, extension]) => [
      field,
      { ...generated.schema?.[field], ...extension },
    ]),
  ),
};
```

This preserves generated metadata such as `positionalIndex` while allowing curated overrides for descriptions, enum values, and CLI-specific fields.

If a curated extension intentionally needs to clear a generated metadata property later, that should be an explicit feature with tests. This design does not introduce clearing semantics.

### Compare effective positional order through aliases

Teach `compareCuratedCommandsToGenerated()` to compare effective positional order, not only raw schema field metadata.

For curated commands, derive effective wire positionals from `curatedConfig.args`:

1. Read `curatedConfig.args` in order.
2. Ignore rest args for positional-index equivalence unless the generated position also names that exact field.
3. Convert each curated arg name through `curatedConfig.aliases`, so `recipe_id` becomes `id`.
4. Compare the resulting field order to the generated positional field order derived from `generatedConfig.schema`.

For `craft`, this means:

```ts
curated args:              ['recipe_id', 'quantity']
curated aliases:           { recipe_id: 'id' }
effective curated fields:  ['id', 'quantity']
generated fields:          ['id', 'quantity']
```

That should not be reported as actionable positional drift.

### Keep raw schema differences for non-positional contracts

The report should continue comparing field presence, type, enum, and required fields.

`craft.action` should still appear as a schema-contract difference unless a separate design classifies it as a known curated CLI extension. It is accepted by the CLI and sent to the API, so it is not client-only and should remain review-visible.

### Keep parser authority unchanged

Do not change `parseArgs()` or command dispatch behavior.

Curated commands define a friendly CLI surface. Generated OpenAPI metadata defines the wire/API shape. They overlap, but they are not the same contract. Runtime parsing should continue to consume curated `config.args` so command help, grouped commands, aliases, and rest arguments remain aligned with the user-facing command surface.

## Alternatives Considered

### Use `schema.*.positionalIndex` for all parsing

Rejected. This would leak API wire names into curated command UX and weaken friendly aliases such as `recipe_id -> id`. It also does not help commands that need rest args or grouped-command-specific UX.

### Add an allowlist for `craft` and `recycle`

Rejected as the primary design. A narrow allowlist would remove current noise, but it would not fix metadata loss during merge and would not help the next curated command that uses a friendly positional alias.

### Only preserve generated schema metadata

Accepted as necessary but not sufficient. Preserving `positionalIndex` reduces noise from whole-object replacement, but the report still needs alias-aware positional comparison to tell whether curated UX fields are equivalent to generated wire fields.

## Acceptance Criteria

- `buildCuratedCommands()` preserves generated `positionalIndex` for generated fields when a curated schema extension overrides only descriptions or other partial metadata.
- `compareCuratedCommandsToGenerated()` does not classify `craft` or `recycle` as actionable solely because `recipe_id` maps to generated `id`.
- `craft.action` remains visible as a schema-contract divergence.
- Existing parser behavior for `craft basic_iron_smelting 5` still sends wire `id=basic_iron_smelting`.
- Existing parser behavior for `recycle basic_iron_smelting 20` still sends wire `id=basic_iron_smelting`.
- Help and completion continue to expose curated `recipe_id` UX where they do today.
- A deliberately mismatched curated positional field with no alias-equivalent generated field still reports as positional drift.

## Test Plan

Add focused tests for command merge behavior:

- A generated route with `schema.id.positionalIndex = 0`.
- A curated override with `schemaExtensions.id.description`.
- Assert the merged schema keeps `id.positionalIndex = 0` and uses the curated description.

Add focused tests for report behavior:

- A curated command with `positionals: ['recipe_id', 'quantity']` and generated fields `id`, `quantity`.
- Assert the report does not emit `schema-positional` differences when `recipe_id -> id` is present in aliases.
- A negative case where `positionals: ['wrong_id', 'quantity']` has no alias to `id`.
- Assert the report still emits a positional difference.

Run existing coverage:

```bash
bun test src/args.test.ts
bun test src/command-metadata.test.ts
bun test src/api-sync.test.ts
bun run report:curated-commands
```

## Risks

The main risk is making the report too permissive. Keep alias-aware positional equivalence narrow: only suppress or downgrade positional differences when the ordered curated positional fields map through explicit aliases to the generated ordered positional fields.

Runtime risk is low because parser and dispatch behavior are unchanged.

## Open Questions

None for this scope. Notification enum drift and OpenAPI query parameter generation should be handled in separate specs or implementation plans.
