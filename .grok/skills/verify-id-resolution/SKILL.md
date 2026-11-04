---
name: verify-id-resolution
description: >
  Check that a typed SpaceMolt id is rewritten only when exactly one cached
  entity of that kind matches, and that two matches stay ambiguous so attack,
  travel, and transfer are not sent at a guessed id. Use when editing
  resolveCachedId, the soft id policy, normalizeSearchText, or the payload
  rewrite in src/id-cache.ts or src/payload.ts, and before finishing a change
  that touches those functions.
user-invocable: true
---

# Verify cached id resolution

## Property

A typed id is rewritten only when exactly one cached entity of that kind matches. Two matches stay ambiguous, and the command is not given either id.

Harm: `attack`, `travel`, `sell`, and transfers would otherwise go to one of the matching ships, POIs, or players. Soft poi and system resolution must not treat a substring as a prefix. `haven` must not become `crosshaven`.

Stages, and a later stage runs only when every earlier stage matched nothing:

1. Exact id or name. Comparison ignores case, turns `_` and `-` into spaces, and trims. The rewrite is the cached id. Every name recorded for that same id still counts, including an older sighting.
2. POI only: exact `context.base_id`. The typed text is kept. It is not rewritten to the POI id. A POI id wins over another POI's base id when both are exact matches for the same text.
3. Prefix, only when that policy allows it. A unique id or name prefix rewrites to the cached id. A unique POI base-id prefix rewrites to the stored base id, not the characters the pilot typed. System and poi soft policy allow this. Strict policy does not.
4. Substring of an id or name, never of a base id. Only the soft policy for kinds other than system and poi allows this. `cell` may become `fuel_cell` for an item. `haven` must not become `crosshaven`. `industrial` must not become a station whose name merely contains that word.

Whitespace-only text is unchanged. A package id may be written `package:` plus the bare id. The prefix is case-sensitive and is stripped once. `package:` with nothing after it stays `package:`. An unknown package id is stored bare.

Duplicate sightings of one id are one entity. A hint of another kind does not count.

`preparePayload` for `attack` stops with exit code 1 when `resolveCachedId` is ambiguous. A strict prefix is sent as typed. A fuzzy unique prefix is sent as the one cached id.

This is not a TLA+ model. `/statechart` does not apply. Nothing model-checks TypeScript. The check calls the real `resolveCachedId` on every list in the bound.

## When a change touches this

Run the check if a diff touches any of these:

- `resolveCachedId`, `softIdResolutionPolicy`, `STRICT_ID_RESOLUTION_POLICY`, `collapseHintsById`, `findMatches`, `resolveMatches`, `normalizeSearchText`, `normalizePackageId` in `src/id-cache.ts`
- `resolveCachedIdsForPayload` or the `attack` path through `preparePayload` in `src/payload.ts`

```bash
git diff 180136c4a55c90516313db2d1bf21da3aa457659 -- src/id-cache.ts src/payload.ts
```

Replace that hash when the coverage record below moves. Also search the diff for a new call to `resolveCachedId`.

A change only in hint extraction (`extractIdHints` and the `push*` helpers) or only in `idKindForCommandField` is not this check, except that `attack` `target_id` must still resolve as a player. Say so, and do not move the sync commit.

## Coverage

| What | Where |
| --- | --- |
| Which cached id a typed string becomes | `resolveCachedId` and the match helpers it calls |
| Strict versus soft prefix and substring | `STRICT_ID_RESOLUTION_POLICY`, `softIdResolutionPolicy` |
| Package prefix and `_` / `-` equivalence | `normalizePackageId`, `normalizeSearchText` |
| Ambiguous `attack` does not send | `preparePayload` → `resolveCachedIdsForPayload` |

Sync commit: `180136c4a55c90516313db2d1bf21da3aa457659`. That commit is the product code this describes. The checker and this skill were written against it and do not change those functions. Move the hash only after the update procedure below, and only to a commit whose covered functions you have re-read. A passing run by itself is not that confirmation: a new match stage the queries never hit can still pass.

## Run

From the repo root, with Bun on `PATH` (confirmed with Bun 1.4.4; no other install):

```bash
bun run verify:id-resolution
```

Pass prints `verify-id-resolution: pass` and the check count. It runs 837230 resolver calls and finishes in about 6 seconds. Exit 0.

Fail prints `verify-id-resolution: fail` and exits 1. The first lines are the counterexample: kind, policy, query, hints, expected, actual. Do not weaken the property or the bound to make a red run green.

## Bounds and assumptions

Every list of 0 to 3 hints whose ids are `a`, `ab`, `b`, or `a_b` and whose names are empty, `a`, `a-b`, or `x`, for player, package, and system, under strict and soft policy. Queries are `a`, `ab`, `b`, `a_b`, `a-b`, `a b`, `A`, ` a `, `A_B`, `x`, `abc`, `haven`, empty, spaces, `package:a`, ` package:a `, `package:`, `package:package:a`, and `Package:a`.

POI lists use ids `a`, `ab`, `a_b`, names empty, `a`, `a-b`, and base ids none, `a`, `a_b`, up to 3 hints. Queries there are `a`, `ab`, `a_b`, `a-b`, `a b`, `A_B`, `haven`, and ` a `. System hints that carry a base id are every pair of those POI shapes, not every triple.

Each generated list also contains one hint of the other kind with id `a`. The result must ignore it.

Fixed cases outside that alphabet: `haven` / `crosshaven`, `cro` / `crosshaven`, poi `industrial`, exact base id `Earth_Station`, item `fuel` / `cell` / `iron`, and two sightings of `sol_earth`. The `attack` probes use cached players `raider_1` and `raider_2`.

Assumptions:

- `seenAt` on generated hints increases with position, so the later hint is newer. Full ties are not enumerated.
- Base ids in the grid are strings. Numeric and boolean base ids are not.
- Names and ids outside the token lists are not enumerated. The fixed cases add the words from the haven and iron incidents.
- Hint extraction from command responses is not checked. The hints are handed to `resolveCachedId` directly.
- `claim_prize` and `service_prize` replace a resolved POI with `context.base_id` in `resolvedStationBaseId`. That second rewrite is not checked.
- Reserved targets (`self`, `faction`, `fuel`, `credits`) and numeric jump bearings skip resolution. They are not checked.
- `idKindForCommandField` is checked only for `attack` `target_id`, which the alias map sends as `id`.

## Read a failure

Replay the printed hints and query through `resolveCachedId`. The actual line is what the real function returned.

It is a bug when those hints are legal cache entries and the actual line rewrites to one id while another id of the same kind also matches that stage, or when a strict call uses prefix or substring, or when soft system or poi resolution uses a substring. Report the query, the two ids, and the command that would send one of them. Do not change product code unless the user asked. Do not edit the expected result so the current code passes.

It is a modeling error when the harness cannot express the new code:

- `attack` no longer returns `payload.id` because the wire field changed. Point the probe at the new field. Keep the rule that an ambiguous target is an exit and not one of the cached ids.
- A new match stage or a new kind rule the queries never exercise. Add that stage to `expectFromCandidates` from the code's promise, then rerun. A disagreement that remains is a bug.
- The policy paragraph at the top of the checker. `softIdResolutionPolicy` no longer matches the pinned rules. Substring on system or poi is a bug unless the change says the haven rule is intentionally gone.

A failure that looks like the scratch below is a bug: soft item query `iron` with `ore_iron` / Iron Ore and `iron_plate` / Iron Plate resolves to `iron_plate` instead of staying ambiguous. That happens if `resolveMatches` keeps the first hint when more than one matched. The code at the sync commit returns ambiguous.

## Update the check when the change is intended

1. Re-read `resolveCachedId`, `findMatches`, `resolveMatches`, and `resolveCachedIdsForPayload` at the new commit. Write down each new stage, kind exception, or payload rewrite.
2. Edit `scripts/verify-id-resolution.ts` from that reading. `expectFromCandidates` is the promise. `pinnedPolicy` is the strict and soft rules. `QUERIES`, `IDS`, `NAMES`, `POI_IDS`, and `BASES` are the bound. Change the property only when the product change says so (the code comment, a test, `CHANGELOG.md`, or the commit message). Record the old sentence and the new sentence, and cite that evidence.
3. Run `bun run verify:id-resolution`.
4. Break the new behavior in the real code, the way deleting the `matches.length !== 1` check would. Run the command again and confirm it fails. Revert that break. Run once more and confirm `verify-id-resolution: pass`.
5. Move the sync commit in this skill to that commit only after steps 1–4. If step 1 found a branch the checker still does not drive, do not move the hash. Either extend the checker or leave the hash and say what is unconfirmed.

## What a pass does not cover

Response parsing into hints, `claim_prize` / `service_prize` base-id substitution, reserved words that skip the cache, and kind inference for commands other than `attack`. A pass means every list in the bound obeyed the property. It does not mean every string a pilot can type was tried.
