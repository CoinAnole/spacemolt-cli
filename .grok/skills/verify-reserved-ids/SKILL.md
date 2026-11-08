---
name: verify-reserved-ids
description: >
  Check one promise of preparePayload: reserved storage targets, fuel,
  tank_fuel, credits on the credit commands, and numeric jump bearings are
  never replaced by a cached id, and claim_prize and service_prize send a
  station field as the cached POI base id when the hint has one. Use when
  editing preparePayload, reservedIdValue, resolvedStationBaseId, or
  resolveReloadWeaponsAmmo in src/payload.ts, and before finishing a change
  that rewrites cached ids onto the wire.
user-invocable: true
---

# Verify reserved ids

## Property

Reserved storage targets, fuel, tank_fuel, credits on the credit commands, and numeric jump bearings are never replaced by a cached id.

`claim_prize` and `service_prize` send a station field as the cached POI base id when the hint has one.

## How to run

Run `bun test src/reserved-ids.test.ts` from the repo root. Pass is exit code 0.

The probes call `preparePayload`. `resolveCachedId` is used only to show the cache would have changed the wire, so a removed bypass cannot pass quietly.

## Failure

A failed probe means a reserved wire string was rewritten, or a prize station field was not sent as the cached base id. That is a product bug in the payload rewrite.

Unique-match id resolution, where two cached matches stay unresolved, is `src/id-resolver.test.ts` and `src/id-cache.test.ts`, not this skill.
