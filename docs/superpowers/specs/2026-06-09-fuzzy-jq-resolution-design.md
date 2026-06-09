# Fuzzy `--jq` Resolution Design

## Goal

Make unresolved `--jq` paths useful for discovery. When a path misses a key, the CLI should inspect sibling keys at the object level where resolution failed, show likely alternatives, and include a compact value preview for each suggestion.

The optional `--fuzzy` flag should turn the same matching logic into an automatic best-match resolver for simple path expressions.

## User-Facing Behavior

When a `--jq` path cannot resolve because a field is absent from an object, the CLI keeps returning an error by default, but appends similar key suggestions when available:

```text
Error: Path not found: ".ship.fuel_capacity"
Similar keys: .ship.fuel (13), .ship.max_fuel (700)
```

Suggestions use full jq-style paths, not bare key names, because the same key can appear under multiple parent objects. The parenthetical preview is formatted with the same scalar-friendly behavior used by jq projection output. Objects and arrays should receive a short JSON preview instead of multi-line output.

If there are no useful matches, the existing path-not-found behavior remains unchanged except for any existing hints such as the `structuredContent` hint.

## Matching Rules

Matching happens only among keys on the object where the path failed. For `.ship.fuel_capacity`, the resolver checks keys under `.ship`; it does not scan unrelated top-level objects.

A key is eligible when any of these conditions are true:

- Substring containment in either direction after normalization. Example: `fuel_capacity` matches `fuel` and `max_fuel` because they share `fuel`.
- Levenshtein distance is less than or equal to 2 after normalization. Example: `fule` matches `fuel`.
- Capacity/complement semantics apply. If the failed token contains `cap`, `capacity`, `max`, or `total`, keys containing `capacity`, `max`, `total`, `limit`, or `size` receive a ranking boost.

Normalization lowercases values and treats common separators such as `_` and `-` as word boundaries.

## Ranking

Suggestions are sorted deterministically:

1. Semantic capacity/complement matches when the failed token asks for that concept.
2. Strong substring matches.
3. Levenshtein matches.
4. Shorter edit distance.
5. Stable path order.

The result list should be limited to a small number of suggestions, with 3 as the default target. This keeps errors readable while still making discovery practical.

## `--fuzzy` Auto-Resolve

`--fuzzy` is a global boolean option.

When `--fuzzy` is present with `--jq`, the evaluator may replace one missing field token with the highest-ranked suggestion and continue evaluating the path. Example:

```bash
spacemolt get_ship --fuzzy --jq '.ship.fuel_cap'
```

Output:

```text
.fuel=13 .max_fuel=700
```

The auto-resolve mode should stay conservative:

- It applies only to simple path expressions, not object construction, comma expressions, or pipes.
- It auto-resolves only when there is one clear best result set.
- For ordinary typo or substring matches, a clear result set is a single key.
- For capacity-style queries, a clear result set may contain multiple semantically related sibling keys, such as `fuel` and `max_fuel`.
- If unrelated suggestions tie for best rank, it fails with the same enriched suggestions instead of guessing.
- It does not change `--field`, `--fields`, or `--keys` behavior.

When the clear best result set contains multiple semantically relevant keys for a capacity-style query, auto-resolve returns a compact object keyed by jq-style leaf paths. This supports discovery-oriented output such as `.fuel=13 .max_fuel=700` for a failed `.ship.fuel_cap` query.

## Implementation Shape

`src/jq.ts` should own the matching and path-resolution behavior because it already parses jq path tokens and formats path-not-found errors. Add a small options object to `evaluateJq` for fuzzy behavior, and preserve the current call signature by making options optional.

`src/display/index.ts` should pass the parsed `options.fuzzy` flag into `evaluateJq` only for `--jq` projections.

`src/global-options.ts` and `src/types.ts` should add the new `--fuzzy` boolean flag. The flag is inert unless `--jq` is present.

## Error Handling

Unsupported jq syntax should continue to report the existing unsupported-expression errors.

Type errors, such as indexing an object as an array, should continue to report the existing type-aware errors.

Missing field errors should include suggestions only when the failed parent value is an object and at least one eligible sibling key exists.

## Testing

Focused tests should cover:

- Missing `.ship.fule` suggests `.ship.fuel` with its value preview.
- Missing `.ship.fuel_capacity` suggests both `.ship.fuel` and `.ship.max_fuel` with previews.
- `--fuzzy --jq .ship.fuel_cap` auto-resolves to the best discovery output.
- `--fuzzy` parses as a global option.
- Existing `structuredContent` path hints still appear when applicable.
- Existing `--jq` successful extraction and unsupported-expression behavior remain unchanged.

Golden output updates are not required unless an existing golden case intentionally exercises a missing `--jq` path.
