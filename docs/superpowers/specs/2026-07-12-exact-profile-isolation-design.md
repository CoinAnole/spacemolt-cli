# Exact Profile Isolation and Concurrent Configuration Design

## Problem

Profile session lookup currently normalizes a requested profile name and then reuses a uniquely similar saved name when the exact name is absent. That typo-correction behavior makes nearby names such as `arbiter47` and `arbiter67` aliases. Concurrent authentication amplifies the problem: one process can create a session file that causes another process to select and overwrite it instead of creating its requested profile.

This produces three related failures:

- successful `login --profile` or `register --profile` operations can persist another player's credentials into the wrong session file;
- the requested session file may never be created;
- later commands can silently read the similar profile instead of reporting that the requested profile is missing.

Separately, CLI preference changes perform read-modify-write updates to `config.json` without coordinating concurrent processes. Atomic session-file replacement protects a selected session path, but it cannot correct a wrong path selection or prevent concurrent configuration updates from discarding unrelated fields.

## Goals

- Treat every normalized profile name as an exact storage identity.
- Make explicit `login` and `register` operations safe to run concurrently for distinct profiles.
- Fail clearly when any other command requests an explicit profile with no saved session.
- Avoid changing the shared default profile during explicitly targeted authentication.
- Prevent concurrent configuration changes from corrupting `config.json` or losing unrelated preferences.
- Document the supported direct-registration and parallel-authentication workflow.

## Non-goals

- Coordinating multiple writers that intentionally target the same profile session file.
- Making a multi-command sequence such as `profile default NAME` followed by `login` into one transaction.
- Preserving automatic typo correction for profile names.
- Adding separate credential files or changing the session JSON format.

## Selected Approach

Use exact, case-normalized profile lookup everywhere and retain the existing atomic session-file write. Add a serialized, atomic update primitive for shared CLI configuration. Authentication commands may create their exact target profile, while commands that require an existing login may not.

Alternatives rejected:

- Keeping fuzzy lookup only for implicit/default profiles would retain two profile identity models and could still silently select unexpected credentials.
- Adding player identity metadata checks would detect some bad selections after the fact but would not prevent selecting the wrong file and would add unnecessary state.

## Profile Resolution

`normalizeProfileName` remains responsible for validating profile names and converting them to lowercase. Session path resolution then uses only that normalized value. It does not inspect existing session filenames and does not substitute case-insensitive or one-edit matches.

Examples:

- `--profile Arbiter47` resolves to `sessions/arbiter47.json`.
- An existing `sessions/arbiter67.json` has no effect on that resolution.
- A missing `sessions/arbiter47.json` remains missing; it is never represented by another file.

Existing sessions whose filenames contain uppercase characters are outside the current normalized naming contract and will not be discovered through a differently cased request. The profile listing still reports actual stored filenames, allowing users to rename legacy files deliberately if needed.

## Authentication Behavior

Global `--profile` parsing already applies to `login` and `register`, including when the option follows positional arguments. The command metadata and documentation will make this support discoverable.

For explicit authentication:

1. `login USER PASSWORD --profile NAME` or `register USER EMPIRE CODE --profile NAME` creates a new bootstrap session for exactly `NAME`.
2. The API request uses that bootstrap session.
3. On success, credentials, player ID, and returned session metadata are saved only to `sessions/name.json`.
4. The operation does not read or change `defaultProfile`.

For implicit authentication:

1. When neither `--profile` nor `SPACEMOLT_PROFILE` is supplied, the CLI derives a safe normalized profile name from the username.
2. It persists the successful authentication to that username-derived session file.
3. If no default profile exists, it may establish that derived profile as the initial default; an existing default is not replaced.

`SPACEMOLT_PROFILE` has the same explicit-target semantics as `--profile` because it is an intentional profile selection.

## Missing-Profile Behavior

Commands other than `login` and `register` that use an explicit profile must load that exact session file. If it is absent, execution stops before the command API request with the existing actionable error identifying the missing normalized profile and suggesting login or `profile list`.

Public commands keep their existing anonymous-session rules. This design does not broaden fallback behavior for commands that read or mutate player state.

## Concurrent Session Operations

Distinct explicit profiles resolve to distinct destination paths before asynchronous work begins. The existing unique temporary-file plus rename strategy remains sufficient for each individual session file. Parallel operations for `arbiter47`, `arbiter57`, and `arbiter67` therefore cannot redirect into one another's files.

Concurrent operations intentionally using the same exact profile remain last-completed-write-wins. Preventing that would require a separate same-profile ownership policy and is not part of this fix.

## Concurrent Configuration Updates

Introduce one configuration update function that owns the complete read-modify-write cycle:

1. Acquire a lock associated with `config.json`, retrying for a bounded period and recovering a demonstrably stale lock.
2. Read and validate the latest configuration while holding the lock.
3. Apply a synchronous mutation to that latest value.
4. Write the result to a unique temporary file with mode `0600`, flush and close it, then atomically rename it over `config.json`.
5. Release the lock in a `finally` block.

`setDefaultProfile` and local `config user-agent` mutations use this primitive so concurrent operations preserve fields changed by other processes. The public whole-object `saveCliConfig` function also uses atomic replacement, but callers performing a logical mutation must use the update primitive rather than loading and saving separately.

If two processes intentionally set `defaultProfile`, the last completed update wins. Locking guarantees a valid file and prevents loss of unrelated keys; it cannot make two separate CLI invocations such as `profile default` and `login` an atomic workflow. Scripts requiring parallel profile isolation should use `--profile` or `SPACEMOLT_PROFILE` directly.

## Error Handling

- Invalid profile names continue to fail before network work.
- Lock acquisition failure reports an actionable configuration error rather than proceeding with an unsafe write.
- Temporary configuration files are removed best-effort after failed writes.
- Lock release occurs even when reading, mutation, flushing, or renaming fails.
- Session-loading parse failures continue to behave as an unavailable session; for an explicit profile, the command then reports the missing-session error rather than selecting another file.

## Documentation

Authentication command examples and the README will show direct named-profile creation:

```bash
spacemolt register Arbiter47 voidborn CODE --profile arbiter47
spacemolt login Arbiter47 PASSWORD --profile arbiter47
spacemolt get_status --profile arbiter47
```

The documentation will state that exact explicit profile operations for different names may run in parallel, while workflows that mutate the single shared default profile should not be used to select per-process authentication targets.

## Testing

Tests will be added before implementation and will cover:

- similar saved names never influence path resolution;
- explicit missing profiles fail instead of loading a one-edit neighbor;
- explicit login creates and enriches exactly the requested file;
- explicit register creates and enriches exactly the requested file;
- parallel explicit authentication for similar profile names produces one correct file per profile;
- explicit login/register leave `defaultProfile` unchanged, including when no default exists;
- implicit authentication retains username-derived profile and initial-default behavior;
- concurrent default-profile and user-agent mutations preserve both valid fields;
- configuration writes use atomic replacement and retain hardened permissions;
- help and command metadata advertise `--profile` registration and login examples.

Focused verification will run the session, API, runner, local-command, command-metadata, and help tests. Final verification will run the full test suite, typecheck, lint, and build.
