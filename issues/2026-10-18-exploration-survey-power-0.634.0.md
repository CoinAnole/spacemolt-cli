## 2026-10-18 — Exploration survey power (gameserver 0.634.0)

Scope: the `survey_system` help sentence about skill bonuses, and the integer printed as `Survey power`. Cached sources: `spacemolt-docs/openapi.json` (`info.x-gameserver-version` is `v0.637.3`), `spacemolt-docs/catalog.json` (`version` `0.637.3`), `spacemolt-docs/changelog.json` release `0.634.0`, `spacemolt-docs/docs/skills.md`, `spacemolt-docs/docs/exploration.md`, `spacemolt-docs/docs/scanning.md`, `spacemolt-docs/api.md`. Bundled CLI metadata stamp is `GENERATED_API_GAMESERVER_VERSION = 'v0.637.3'` in `src/generated/api-commands.ts`. No live server response was collected. The OpenAPI 200 example for this operation is a placeholder (`message` `"example"`, `skills.armor.name` `"example"`, `details.survey_power` `1`) and is not a measured survey.

### 1. OpenAPI survey prose omits Exploration `surveyPower`

`POST /api/v2/spacemolt/survey_system` `description` in `spacemolt-docs/openapi.json`:

> Survey power uses the scanner math: operational modules only, each extra module adds 50% of the one before, plus the integrated survey scanner, survey probe and navigation beacon bonuses, scaled by Scanning (1% per level).

That sentence does not mention Exploration.

`components.schemas.Skill.properties.bonus_per_level` is an open object of integers (`additionalProperties: { type: integer }`). It has no description and no named keys. `bonus_per_level` is not in `Skill.required`. The schema cannot confirm `surveyPower`.

`spacemolt-docs/catalog.json` skill `id` `exploration` (same catalog version `0.637.3`):

- `bonus_per_level`: `{ "surveyPower": 1 }`
- `description`: "Discovery and surveying. Increases survey power by 1% per level, added to the Scanning skill's bonus. survey_system reveals a hidden POI when your survey power reaches its reveal difficulty."
- `training_source`: "Visit systems for the first time."

`spacemolt-docs/changelog.json` release `0.634.0` (2026-10-17), note 3:

> **Exploration skill levels:** each Exploration level now adds 1% survey power, added to the Scanning skill bonus. Higher survey power lets `survey_system` reveal harder hidden POIs. The Exploration catalog bonus key is now `surveyPower`.

Catalog and changelog agree. The operation description lags both. The cached catalog still carries the 0.634.0 sentence at stamp `0.637.3`.

CLI assumption: `survey_system` help keeps the existing Scanning clause ("Scanning scales the total by 1% per level"), because the operation description still says that and the changelog says Exploration is added to the Scanning bonus. Help adds the catalog sentence: Exploration increases survey power by 1% per level, added to the Scanning skill bonus, and names `bonus_per_level.surveyPower` with gameserver `0.634.0`. Help does not claim the OpenAPI schema lists that key.

### 2. No source states the combined Scanning-plus-Exploration expression

The operation description says survey power is "scaled by Scanning (1% per level)". The catalog Exploration description says the Exploration increase is "added to the Scanning skill's bonus". The changelog says the same with "added to the Scanning skill bonus". None of those texts, and not `SurveySystemResponse`, gives an expression (sum of the two percents, product of two factors, or any other combination). The published 200 example does not include an Exploration or Scanning skill level next to `survey_power`.

CLI assumption: help uses those source verbs and does not add a worked total, a second percentage for Scanning's catalog key, or a formula. `src/display/survey.ts` keeps printing `Survey power:` from `details.survey_power`. The client does not derive that integer from skill levels.

### 3. Scanning's catalog key is `scannerEffectiveness`, while the survey operation still names Scanning

`spacemolt-docs/catalog.json` skill `id` `scanning`:

- `bonus_per_level`: `{ "scannerEffectiveness": 1 }`
- `description`: "Sensor operations and target detection. Increases scanner effectiveness by 1% per level."

There is no `surveyPower` key on Scanning.

`spacemolt-docs/docs/skills.md` Support table: "Scanning | Scanner effectiveness +1% per level". `spacemolt-docs/docs/scanning.md` applies that 1% to ship scanner power for `scan` ("scaled by your Scanning skill (1% per level)"), which matches `scannerEffectiveness` and does not mention `survey_system` survey power.

The survey operation description still says survey power is scaled by Scanning at 1% per level. Changelog note 3 says Exploration survey power is added to "the Scanning skill bonus" and does not rename Scanning's key to `surveyPower`.

CLI assumption: help does not retcon Scanning's catalog key. The existing "scales the total by 1% per level" clause stays, attributed to Scanning, as the operation description states. The new clause attributes `surveyPower` only to Exploration.

### 4. `skills.md` and `exploration.md` lag the Exploration catalog sentence

`spacemolt-docs/docs/skills.md` Exploration table:

> Exploration | Scan range and detail level | Visit systems for the first time

`spacemolt-docs/docs/exploration.md` "Surveying: Finding What Is Hidden" says success depends on survey power against deposit difficulty and that the sweep awards Scanning and Deep Core Mining XP. The career paragraph says the Exploration skill grows as you visit new systems. Neither page states +1% survey power per Exploration level or the key `surveyPower`.

Training ("visit systems for the first time") matches `catalog.json` `training_source`. The effect column does not match the catalog `description`.

CLI assumption: help follows `catalog.json` and changelog `0.634.0` for the Exploration effect. It does not copy "Scan range and detail level". `spacemolt catalog type=skills id=exploration` already prints the server `description` and `summarizeBonusPerLevel` output (`Bonuses: surveyPower 1` when the catalog sends that key). This complaint does not ask for a catalog-formatter change.

### 5. `survey_power` on the response is an integer with no client formula

`components.schemas.SurveySystemResponse.properties.survey_power` is `{ "type": "integer" }` with no description. It is required, with `system_id`, `system_name`, `deposits`, `newly_revealed`, `already_revealed`, `faint_signatures`, `wildlife`, `bloom_intensity`, `bloom_status`, `xp_gained`, and `message`. `deposits.description` says the array is empty when survey power is 0. It does not say how the integer was computed.

CLI assumption: table output keeps `Survey power: ${r.survey_power}` in `src/display/survey.ts`. Help states that this line is the server `survey_power`. Empty-deposits copy keeps using that same integer (`finiteNumber(surveyPower) === 0`). `--json`, `--yaml`, and `--structured` stay pass-through.

### 6. Other 0.634.0 skill pages (CLI non-goal)

Checked while confirming the Exploration row. No `survey_system` help change, and no help change for these skills, follows from this item.

- `spacemolt-docs/docs/skills.md` Piloting: "Module effectiveness on larger ships; capital ships require Piloting level 70". `catalog.json` skill `piloting` description: travel speed between POIs +1% per level, jumps unaffected, tier gates 10/20/30/50, `bonus_per_level.travelSpeed` `1`. `spacemolt-docs/api.md` says "Higher-tier ships require minimum Piloting level (T2=10, T3=20, T4=30, T5=50)." Changelog `0.634.0` note 4 matches the catalog. `skills.md` contradicts the catalog and `api.md`.
- `spacemolt-docs/docs/skills.md` Piracy Improves cell: "Loot from raids +1% per level, scan evasion against customs and NPC inspections +1% per level". The scan-evasion clause matches catalog `bonus_per_level.scanEvasion` `1`. The loot clause is coarser than catalog skill `piracy` ("When you destroy a player's ship, the share of its cargo that drops into the wreck rises by 1% per level (a 60% drop becomes 90% at level 50), up to all of it. Also improves scan evasion against customs and NPC inspections by 1% per level.") and changelog `0.634.0` note 2 (1% relative to the base drop rate; a 60% drop becomes 90% at level 50, capped at 100% of the cargo). `bonus_per_level` is `lootingBonus` `1` and `scanEvasion` `1`.
- `spacemolt-docs/docs/skills.md` Wormhole Navigation: "Wormhole transit accuracy". Catalog `wormhole_navigation` description and changelog `0.634.0` note 5: 4 prediction power per level, key `wormholePrediction`.
- `spacemolt-docs/docs/skills.md` Drone Control Improves cell: "Drone combat damage, mining yield, and repair rate +1% per level; each level allows one more concurrently scripted drone". Catalog skill `drone_control` description: "Improves drone combat damage, mining yield, and repair rate by 1% per level, and adds 1 percentage point of drone hit chance per level. Drone deployment count is gated by the bandwidth of installed drone bay modules — this skill makes the drones you deploy more effective." The bandwidth sentence is that catalog description only. Changelog `0.634.0` note 6 says the description now includes the existing drone hit-chance bonus of 1 percentage point per Drone Control level, and that existing per-level Engineering, Stealth, and Drone Control effects are unchanged. Note 6 does not mention bandwidth. `bonus_per_level` is `droneDamage`, `droneMiningYield`, and `droneRepairRate` (each `1`). The hit-chance sentence is catalog prose; the map has no hit-chance key. The `skills.md` clause "each level allows one more concurrently scripted drone" is the part that disagrees with the catalog bandwidth sentence.

CLI assumption: those four rows are out of scope for the `survey_system` help edit.
