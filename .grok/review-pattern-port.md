# Port the tools review-pattern ledger handoff

This file is a brief for an agent working in `~/spacemolt-cli-source`. Do not run a live cleanup or audit unless asked.

The tools repo at `/home/spacemolt/.hermes/tools` (`master`, `4869d523`) moved ledger reads, appends, diffs, and checks out of workflow execute agents and into one program the orchestrator runs. The CLI workflows still use the old design. Port the seam. Keep the CLI judgment rules.

## What is wrong in this repo today

`.grok/workflows/review-pattern-cleanup.rhai` (about 3700 lines) and `.grok/workflows/review-pattern-ledger-audit.rhai` (about 1900 lines) cannot read the repo. They spawn execute agents to run Python, then carry the ledger back as chunked base64 (`CHUNK` 4500) and decode it in Rhai, including a small non-ASCII catalog. A schema miss on those agents retries inside the call and cannot time out. The writer agent appends only when length and `FILE_SUM` match. The check agent runs `bun run lint`, `bun run typecheck`, and targeted `bun test`.

That transport is the part to delete. Scan, verify, edit, and one repair stay agents.

## Read these, do not edit them

Tools reference, in `/home/spacemolt/.hermes/tools`:

- `.grok/review_pattern_ledger.py` — the program. Commands: `read`, `plan`, `append`, `classify`, `diff`, `check`.
- `tests/test_review_pattern_ledger.py` — subprocess tests. They pass `--ledger` and `--root` and never touch the tracked JSONL.
- `.grok/workflows/review-pattern-cleanup.rhai` — `ledger_fault`, `pause_ledger`, `GATE append-rejections`, `GATE check`, `GATE recheck`.
- `.grok/workflows/review-pattern-ledger-audit.rhai` — `GATE append-drops`, census from `args.census`.

Commits: `7967a5bc` added the program and the gates. `9866e2ff` made a bad ledger pause name the failed check.

## Keep these CLI rules

Do not copy the tools pattern text, area catalog, `under_root`, or `ruff` / `ty` / `unittest` checks. Do not replace `boundary_match` with `under_root`. An exclude here matches when the next character is `.`, `/`, or `-`, so `src/display/combat` excludes `src/display/combat-effects.ts`.

Families stay `comment`, `helper`, `presence`, and `test`. Tools families are `comment`, `helper`, `repeated`, and `doc`. A CLI row with `presence` or `test` must remain valid.

Keep:

- The 15-line helper cap, and the refusal to inline exports, named formatters, callbacks, and test imports.
- `test_reason_contradicts`. A test rejection or refusal whose reason says the branch is still unlocked is not written.
- `pattern_rules`, `source_rules`, the area catalog, and the formatter-test path list.
- Editor `biome check --write` on the files that editor changed, via `node_modules/.bin/biome`. Editors still do not run `bun test` or `tsc`.
- The repair prompt: restore a presence guard, restore a dropped `typeof` test, fix or remove a new test without changing production code to satisfy it, and restore a production edit when `src/output-golden.test.ts` fails. Do not refresh a golden. Do not set `UPDATE_GOLDENS`, `LIVE_API_SYNC`, or `STRICT_FIXTURE_SCHEMA_DIVERGENCES`. Do not run `bun test` with no path arguments.
- The tracked ledger `.grok/review-pattern-ledger.jsonl` (135 lines as of this brief). Do not seed it, rewrite it, or hand-edit it. A drop line is `{"op":"drop","family","file","line","quote"}`. Cleanup still appends four-key rows. Audit still appends drops only.

## Add one program

Add `.grok/review_pattern_ledger.py`. It is not a console script. Model it on the tools program. Change two things: the family set, and the check commands.

Stdout for `read`, `plan`, and `append` is one JSON object. `classify` prints census text. `diff` and `check` print the line protocols below. `plan` and `append` report the real hashes of the projected bytes.

`read` prints `ok`, `entries`, `file_bytes`, `file_sum`, `file_sha256`, `active_count`. Active entries are the four-key rows that survive drop lines. A missing default JSONL whose git stderr contains `does not exist in`, with no old `.json` object beside it, is an empty ledger: `plan` exits 0 and does not create the file. Any other missing path is exit 3 and creates nothing. A present zero-byte file is invalid for `read` (exit 2) and still matches an empty expect snapshot for `plan` and `append`. Append uses `O_CREAT|O_APPEND|O_WRONLY` only when the payload is non-empty.

Append is compare-and-append under one `flock` `LOCK_EX`. If the lock cannot be taken, exit 4. The expect snapshot is length, byte sum, and sha256 together. Writer stdout is not evidence. A following `read` is.

Exit codes: 0 success, 1 spawn or I/O, 2 invalid, 3 mismatch, 4 lock or short write. Reject a lone UTF-8 surrogate before opening the file (exit 2). `classify` prints `ABSENT 0` for an entry it cannot use.

`diff` runs `git diff --name-only HEAD` and `git ls-files --others --exclude-standard`. A git non-zero status prints `DIFF_OK no` and the process still exits 0. A spawn failure exits 1.

```text
DIFF_OK yes
DIFF_COUNT 0
END_DIFF
```

`DIFF <path>` lines repeat `DIFF_COUNT` times. Count 0 means that line is absent.

`check` stdin is the request object the workflow writes: `op` (`check` or `recheck`), `baseline_ok`, `baseline_succeeded`, `baseline_files`, `edited`, `check_files`. File selection must match the script's own list, or the script pauses:

- Baseline succeeded and the second diff succeeded: paths added since the baseline that pass `editable`, plus an editor-reported `editable` path that is still dirty.
- Otherwise: the editor-reported `editable` paths.
- An empty selected list skips the suite. Header uses `CHECK_RAN no` and `CHECK_OK skipped`. Process exit 0. Do not open a gate for that skip; the script does not open `GATE check` when no editor was queued.

When the list is non-empty, run every command even if an earlier one fails:

1. `bun run lint` (`biome check src/` in `package.json`).
2. `bun run typecheck` (`tsc --noEmit`).
3. `bun test` on the targeted files only. Targeted files are edited paths that end in `.test.ts`, plus each sibling of an edited production file: the stem plus `.test.ts`, or the stem plus a dot, more name, and `.test.ts`, in the same directory. Skip a derived path that does not exist. When none exist, the test step passes and the summary says so.
4. When `needs_golden` is true for that file list, `bun test src/output-golden.test.ts`. `needs_golden` is true for a production `.ts` file under `src/display/`, or for `src/notification-format-shared.ts`, `src/notification-summary.ts`, `src/notifications.ts`, or `src/preview.ts`.

`bun` comes from `PATH`, then `~/.bun/bin/bun`. Do not set `UPDATE_GOLDENS`, `LIVE_API_SYNC`, or `STRICT_FIXTURE_SCHEMA_DIVERGENCES`. Do not edit files. Do not run `bun test` with no path arguments.

Check stdout, in this order, then an opaque summary:

```text
OP check
DIFF_OK yes
DIFF_COUNT 1
DIFF src/example.ts
END_DIFF
CHECK_RAN yes
CHECK_OK no
SUMMARY_TRUNCATED no
CHECK_COUNT 1
CHECK src/example.ts
END_CHECK
```

`OP` is `check` or `recheck`. `CHECK` lines repeat `CHECK_COUNT` times. Clip each command's combined output the way the tools program clips (1500 bytes) and set `SUMMARY_TRUNCATED yes` when that happens. `CHECK_OK no` with a non-empty summary is the only repair trigger. A second repair is not allowed.

`classify` reads the same active entries and prints one `index ON|MOVED|ABSENT hits` line each, then `COUNT <n>`. The audit script already parses that shape.

## Gates

The host has no shell and no repo read. `await_user` journals and continues on resume. `pause` does not journal and re-fires. Resume has no payload field. `args` are immutable. `read_scratch_file` is a live read of `dirname(state.json)/scratch/<name>`. Do not call it on a result slot before the `await_user` that publishes that slot. That call would be journaled and replayed as `PENDING`.

Before each gate, write the request file and write the result slot as the exact bytes `PENDING\n`. The orchestrator replaces the slot by writing a regular file at `name.result.new` in that scratch directory and renaming it over the slot. A symlink fails the read.

`WorkflowRunStatus` uses `complete` and `blocked`. The watcher `~/.grok/long-running-background-tasks/watch_review_pattern_cleanup.sh` already treats `blocked` as action required and prints `pause_message`, and treats `complete` as done. It also appends `scratch/refusals.json` when that file exists. Use that script. Do not edit it for this port.

Cleanup gates, after Verify and before Clean, including when apply is false, but only when there is at least one new rejection row:

1. `plan` with `scratch/append-rejections.json` on stdin. Exit 3: leave the run paused. Do not append.
2. `append` with the same stdin. Exit other than 0: do not resume. Exit 4: the file may be partial. Do not truncate it.
3. `read`. Resume only when `ok` is true, `file_sha256` equals `plan.next_file_sha256`, and `active_count` equals `plan.next_active_count`.

The slot is eight lines and no extra blank line:

```text
OP append-rejections
MODE keep
EXIT 0
FILE_BYTES <read.file_bytes>
FILE_SUM <read.file_sum>
FILE_SHA256 <read.file_sha256>
ACTIVE_COUNT <read.active_count>
APPENDED <row count, or 0 when plan.already>
```

The script accepts that slot only when the keys are in that order, `MODE` is `keep`, `EXIT` is 0, and `ACTIVE_COUNT` equals the in-memory count after `ledger_note`. `APPENDED` is logged. It is not the acceptance check. On mismatch, `pause` and do not edit.

`GATE check` copies `check` stdout onto `scratch/check.result` unchanged. Non-zero exit: do not resume. The script recomputes the file list from the `DIFF` lines and pauses when it disagrees with the `CHECK` lines. `GATE recheck` is the same with `op` `recheck`. Do not start a repair agent after recheck.

Refusals stay out of the append gate. When apply is true and a matched refusal survives `ledger_note`, write `scratch/refusals.json` in the same keep-request shape and name it in the report. Apply false writes no refusal file. `complete` may still receive `refusals_path`; the host summary keeps `report` and `path` only, so the file and the report line are the signal.

Audit uses the same program in drop mode. `GATE append-drops` uses `MODE drop`. Accept on `ACTIVE_COUNT` versus the count after those drops. Apply false writes nothing. When `active_count` is 0, omit census, skip Judge, and finish. When it is greater than 0, `args.census` is required and is `classify` stdout passed through unchanged. A present census on an empty ledger must be exactly `COUNT 0\n`.

Cut the audit workflow over before the cleanup workflow, so an old cleanup reader cannot pause a new append. Do not run an old cleanup and a new audit against this JSONL at the same time.

A missing or invalid `args.ledger` pauses before Scan or Judge. The pause names the failed check, for example `active_count 71 against 68 entries` or `entry 0 family is not comment, helper, presence, or test`. Resume does not retry the read. Say to stop and start a new run.

Delete from both workflows: the base64 codec, the UTF-8 catalog, `CHUNK`, `self_test`, the reader and part agents, the append and drop writer agents, the census agent, the diff agents, the lint/typecheck/test agents, and the mid-edit intact ledger re-reads. Concurrent ledger drift during Clean and Check is accepted. The append gate is the durability check.

## Launch

The workflow tool has no args file. Do not customize Grok Build to add one.

The orchestrator runs, from this repo:

```bash
python3 .grok/review_pattern_ledger.py read
python3 .grok/review_pattern_ledger.py diff
```

Save the read stdout. Pass that JSON object through as `args.ledger`. Do not rebuild `entries`, `active_count`, or `file_sha256` in the tool call. Parse `diff` into `args.baseline` as `{ok, files}`. `DIFF_OK yes` and `DIFF_COUNT 0` is `{ok: true, files: []}`.

Before watching the run, compare the run's `args.json` ledger with the read file. Stop the run when the entry count, `file_sha256`, or entries differ. A shortened list whose `active_count` was also lowered would pass the script and scan with a quietly incomplete skip list.

For audit, also run `classify` with the read JSON on stdin when `active_count` is greater than 0, and pass that stdout unchanged as `args.census`.

This repo has no `.venv`. The gate text should say `python3`.

## Tests and smoke

Add subprocess tests beside this repo's existing tests, or a `unittest` module if that is the local pattern. Point them at a temp ledger and a temp root. Cover a keep append, a drop append, exit 3 on a mismatched snapshot, surrogate rejection, `plan` not creating a non-empty missing path, `classify` `ABSENT`, and a check header with `CHECK_OK yes` and `CHECK_OK no`. The check test should stub or isolate `bun` so it does not run the real suite against the repo.

Smoke each workflow with `validate_only`: missing ledger pauses with the named check; an empty ledger finishes audit without judging; a one-row ledger of a CLI family gets past the ledger check. Do not claim that smoke ran `bun` or appended to the real JSONL.

## Done

Both workflows load `args.ledger` and no longer contain `b64_decode`, `CHUNK`, or `ledger_read_prompt`. Cleanup has the three gates. Audit has `GATE append-drops` and takes census from `args.census`. The program's families are the CLI four. Its check commands are `bun run lint`, `bun run typecheck`, targeted `bun test`, and the golden test when `needs_golden` says so. The tracked JSONL is byte-for-byte unchanged by the port.
