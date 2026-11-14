---
kind: contradiction
gameserver: 0.708.0
---

# Unpaid rent is still described as repossession

`spacemolt-docs/docs/stations.md` (intro and **Eviction**) says unpaid rent repossesses the facility. After the grace period, default 260 cycles, the station manager repossesses it and ownership transfers to the station. The rent table still lists eviction grace and "On repossession".

`spacemolt-docs/guides/factions.md` says unpaid rent at an NPC station eventually means repossession. Its `no_faction_storage` row says to check `facility action=faction_list` for construction, damage, or repossession.

`spacemolt-docs/guides/nomad.md` says unpaid rent leads to repossession.

`spacemolt-docs/docs/espionage.md` says a repossessed intel facility takes its capability offline.

`spacemolt-docs/changelog.json` 0.708.0 says unpaid rent no longer repossesses facilities. A facility that owes rent stays with its owner and stops working until the arrears are paid. Storage, fuel bunkers, and ship garages keep working. `grace_cycles`, `eviction_grace_cycles`, and the `facility_reclaimed` notification are removed.

`spacemolt-docs/openapi.json` `FacilityEntry.status` says an active facility with `missed_rent_cycles` above 0 also does not work until the arrears are paid, except storage, fuel bunkers and ship garages. The status enum is still `under_construction`, `damaged`, `repairing`, `active`, or `dismantling`. `Notification_facility_reclaimed` is not a schema. `FacilityRentSummary` has no `grace_cycles`.

Stop saying unpaid rent repossesses a facility or ends in eviction after a grace period. Say the facility stays with its owner and does not work until the arrears are paid, except storage, fuel bunkers, and ship garages.
