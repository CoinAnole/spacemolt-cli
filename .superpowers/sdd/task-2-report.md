# Task 2 Report: Alias-Aware Positional Divergence Reporting

## Status

DONE

## Scope

Implemented only Task 2 in the requested worktree:

- Added alias-aware effective positional comparison to `src/test-support/curated-command-compare.ts`.
- Added the specified alias-equivalence and negative positional-drift tests to `src/test-support/curated-command-compare.test.ts`.
- Kept curated parsing controlled by `config.args`; no changes were made to `src/args.ts`.
- Kept generated fallback parsing controlled by generated schema positional metadata.
- Preserved true schema differences, including explicitly curated positional-index changes and `craft.action`.
- Did not change craft or recycle help text.

## Implementation

The report now:

1. Derives generated positional fields from schema `positionalIndex` order.
2. Resolves curated positional names through `CommandConfig.aliases`.
3. Compares the effective curated wire-field order to generated positional order.
4. Emits an actionable `schema-positional` difference on `args` when the effective orders differ.
5. Suppresses only positional-index metadata differences for fields proven equivalent, while leaving unrelated schema-contract differences visible.

## Test-First Evidence

The required focused test was run before production implementation:

```text
bun test src/test-support/curated-command-compare.test.ts --test-name-pattern "positional"
```

Result before implementation: 3 passed, 1 failed. The negative test failed because no `schema-positional` difference was emitted for effective positional order drift.

## Verification

Focused positional tests after implementation:

```text
4 pass, 0 fail
```

Full curated-command comparison test file:

```text
bun test src/test-support/curated-command-compare.test.ts
15 pass, 0 fail
```

Additional verification:

```text
bun run typecheck
tsc --noEmit: exit 0

git diff --check
clean
```

## Commit

`96d2cbd fix: compare curated positional aliases by wire fields`

## Self-Review

- Only the requested comparator and test files were committed.
- No runtime parser or user-facing help changes were made.
- No broad positional or report suppression was added.
- The worktree still contains pre-existing untracked `.superpowers/` content; it was not staged or modified beyond this required report file.

## Review Follow-Up

Addressed review findings:

- When effective curated positional order matches generated order through aliases, the comparator now returns the complete generated positional field set for `positionalIndex` suppression. The suppression remains limited to that schema field.
- Strengthened the alias-equivalence regression by setting curated `id.positionalIndex` to `99`; the test still requires `schema.action` to remain visible and rejects any `schema-positional` difference.
- Updated the actionable positional-drift test to use a real effective-order mismatch and assert that the difference is reported on field `args`.

Verification after the fix:

```text
bun test src/test-support/curated-command-compare.test.ts --test-name-pattern "positional"
4 pass, 0 fail

bun test src/test-support/curated-command-compare.test.ts
15 pass, 0 fail

bun run typecheck
tsc --noEmit: exit 0

git diff --check
clean
```

The full suite was also run with `bun test`: `1822 pass, 9 fail` across 1831 tests. All 9 failures are existing OpenAPI-dependent tests failing with `ENOENT` because this worktree does not contain `spacemolt-docs/openapi.json`; no comparator test failed in that run.
