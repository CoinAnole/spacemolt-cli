# Output Golden Testing Design

## Purpose

SpaceMolt CLI output has had regressions where responses were unexpectedly truncated, malformed, or routed through the wrong human or machine-readable format. The CLI already has focused formatter tests and a pure display renderer, but output stability is mostly enforced by scattered examples. This design adds a committed golden-output test system that makes full stdout and stderr drift visible in review without contacting the SpaceMolt server.

The primary goal is exact output stability. Once a command's output is considered good, future changes should need golden updates only for intentional output changes or newly added commands.

## Scope

The first implementation covers deterministic, server-free tests for:

- Human table/text output from structured API responses.
- Machine-readable `--json`, `--structured`, `--format=json`, `--format=yaml`, and compact variants.
- Projection modes such as `--field`, `--fields`, and representative `--jq`.
- CLI-level paths that can affect output before formatting, including global option precedence, stdout/stderr routing, and error envelopes.

The suite does not fetch live API data. It uses committed fixtures and fake clients only.

## Recommended Approach

Use a hybrid golden system:

- Renderer-level goldens provide broad coverage over formatter fixtures by calling `renderStructuredResult` and `renderResult` directly.
- CLI-level goldens provide a smaller set of end-to-end checks by calling `runInvocation` with a fake client and deterministic runtime context.
- Lightweight contract assertions run beside exact comparisons to produce clearer failure messages for JSON/YAML validity, stdout/stderr separation, and accidental fallback markers.

This keeps broad formatter coverage fast while still catching bugs that happen outside the formatter layer.

## Golden File Layout

Golden files should be plain committed text files under `src/golden-output/`:

```text
src/golden-output/
  renderer/
    get_status.table.stdout
    get_status.json.stdout
    get_status.yaml.stdout
    view_market.table.stdout
  cli/
    get_status.--json.stdout
    get_status.--structured.stdout
    validation-error.--json.stdout
    unknown-command.table.stderr
```

Each test case renders into a normalized record:

```ts
{
  exitCode?: number;
  stdout: string;
  stderr: string;
}
```

Use separate `.stdout` and `.stderr` files so stderr-only warnings and machine-readable stdout can be reviewed independently. Expected exit codes live in the test case definitions. They do not need separate golden files.

## Determinism

The harness must normalize all unstable inputs:

- Fixed clock timestamp.
- `plain: true` by default to remove ANSI codes.
- Stable empty environment except variables required by a specific case.
- Disabled update checks through injected runner dependencies.
- Fake `SpaceMoltClient` responses from local fixtures.
- Temporary config/session directories only when a case intentionally covers session-dependent output.
- No live network calls.

Color output can be covered separately with a small opt-in case, but the default golden suite should compare plain text.

## Renderer-Level Cases

Renderer cases should be generated from the existing fixture collections in `src/display/formatter-fixtures.ts`.

For high-value fixtures, create exact goldens for:

- `table` output.
- `text` output where it differs or confirms parity with table behavior.
- `--format=json`.
- `--format=yaml`.
- Compact JSON.
- Representative projections for stable fields.

Formatter-specific fixtures should assert the complete formatted output and should fail if they fall back to `=== Response ===` unexpectedly.

## CLI-Level Cases

CLI-level goldens should cover a smaller set of commands and errors where runner behavior matters:

- `get_status --json`.
- `get_status --structured`.
- `get_status --format yaml`.
- A validation error in table mode.
- A validation error in JSON mode.
- Unknown command in table mode.
- Unknown command in JSON mode.
- Structured API error output.

These cases should run through `runInvocation` with an injected fake client and dependencies, not through the real server.

## Update Workflow

Golden updates should be explicit:

```bash
UPDATE_GOLDENS=1 bun test src/output-golden.test.ts
```

Without `UPDATE_GOLDENS=1`, the test only compares against committed files. With it, the test rewrites goldens from current renderer output. Reviewers can then inspect ordinary file diffs to approve intentional output changes.

## Guardrails

Exact goldens are the source of truth, but the harness should also enforce useful invariants:

- JSON outputs parse as JSON after exact comparison.
- YAML outputs are exact-compared and pass a simple structural sanity check using expected top-level keys from the case definition. The first implementation should not add a YAML parser dependency just for tests.
- Machine-readable stdout is not mixed with warnings or human text.
- Known non-machine-readable warnings go to stderr.
- Human formatter cases do not unexpectedly fall back to raw JSON unless the case explicitly allows it.
- Rendered output does not contain accidental `undefined`, `NaN`, or `[object Object]` strings unless a case explicitly allows one.

These checks are guardrails, not replacements for golden comparison.

## Adding New Commands

When a new command is added:

- Add or extend a local fixture with representative structured content.
- Add the fixture to the high-value set if users rely on the human output.
- Run the golden update command.
- Review and commit the new golden files with the command change.

This makes command output reviewable at the same time as the command implementation.

## Open Decisions Resolved

The project should favor exact output stability over broad contract-only testing. Contract checks remain useful for failure diagnostics, but intentional output changes should be visible as golden diffs.
