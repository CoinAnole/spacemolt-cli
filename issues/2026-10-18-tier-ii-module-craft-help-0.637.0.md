## 2026-10-18 — Tier II+ module craft help (gameserver 0.637.0 and 0.637.1)

Scope: one curated help sentence on `craft` and `recycle`. No parser, no recipe-id rewrite, no `generate:api`, no live call. Cached sources compared below. `spacemolt-docs/changelog.json` `current_version` is `0.637.3`. Bundled CLI metadata stamp is `GENERATED_API_GAMESERVER_VERSION = 'v0.637.3'` in `src/generated/api-commands.ts`. `spacemolt-docs/catalog.json` `version` is `0.637.3` (851 recipes). Nothing below is a live server body.

### 1. OpenAPI does not state the tier II+ module input

`spacemolt-docs/changelog.json` release `0.637.0` (2026-10-18), note 1:

> Every upgraded module recipe (tier II and higher) now needs one of the module one tier below as an input. Example: `build_pulse_laser_ii` takes `pulse_laser_i`, and `build_shield_booster_iv` takes `shield_booster_iii`. 43 recipes changed.

`components.schemas.Recipe.properties.inputs.description` in `spacemolt-docs/openapi.json`:

> Materials consumed per production run. Empty on a package operation, whose real manifest is chosen at craft time, and on a labour-only recipe that consumes nothing at all.

`RecipeInput` is only `item_id` (string, no description) and `quantity` (integer, no description). `Recipe.properties.id.description`:

> Stable recipe identifier. Pass it as recipe_id to craft or to facility action=job_add, and it is what catalog type=recipes id={id} looks up.

No pattern, enum, or prose on `Recipe`, `CatalogRecipe`, `RecipeInput`, `POST /api/v2/spacemolt/craft`, or `POST /api/v2/spacemolt_catalog` mentions tier, a previous-tier module, or those two example ids. `spacemolt-docs/docs/crafting.md` says specific formulas are deliberately not documented on the site and points at `catalog type=recipes`.

Cached `spacemolt-docs/catalog.json` does show the changelog examples: `build_pulse_laser_ii` inputs start with `{item_id: pulse_laser_i, quantity: 1}`; `build_shield_booster_iv` inputs start with `{item_id: shield_booster_iii, quantity: 1}`. That file is data, not a rule. It has no marker for which recipes "changed."

CLI assumption: the help sentence states the changelog rule (every tier II+ module recipe takes one of the module one tier below). The CLI will not scan `catalog.json` or recipe `inputs` to decide which ids qualify, and it will not encode the "43 recipes" count.

### 2. Recycling prose says inputs come back; the changelog says the lower-tier module does not

`spacemolt-docs/changelog.json` release `0.637.0`, note 3:

> Recycling a higher-tier module never returns the lower-tier module inside it.

`POST /api/v2/spacemolt/recycle` `summary`:

> Queue a recycling job: consume a recipe's outputs to recover a fraction of its inputs

The same operation's `description` says the job "returns a lossy fraction of its inputs over subsequent ticks" and "Recycling is always a net loss by design." `Recipe.properties.no_recycle.description`:

> True when the process is irreversible and a recycling facility cannot run it backwards. Absent (false) means a recycler can reverse it to recover the inputs.

There is no recycle-yield schema, and `RecipeOutput` is not described as "what recycle returns." On `build_pulse_laser_ii` in `spacemolt-docs/catalog.json`, `no_recycle` is absent and `inputs` includes `pulse_laser_i`. Nothing on that entry says recycle drops `pulse_laser_i`.

The same "fraction of its inputs" sentence is in `spacemolt-docs/docs/crafting.md` (Recycling), `spacemolt-docs/guides/crafting.md` (`recycle` — recover inputs from outputs), `spacemolt-docs/skill.md` (`recycle(...)` summary), and `spacemolt-docs/api.md` (the `recycle` command blurb). None of those pages mention a module that recycle keeps.

CLI assumption: help says recycling does not return that lower-tier module. The CLI will not change how recycle outputs are printed, will not set or infer `no_recycle`, and will not claim that every other input is destroyed. Lossy return of other inputs stays the older docs' general rule and is not restated in this sentence.

### 3. `complete_queued_<module>_order` is not a schema

`spacemolt-docs/changelog.json` release `0.637.1`, note 2:

> These jobs now show a `complete_queued_<module>_order` recipe (for example `complete_queued_autocannon_ii_order`) in your job list and crafting logs, in place of `build_<module>`. If your scripts match on the recipe id, add this form.

Note 1 says jobs queued before the upgrade finish on the inputs they took and do not need the lower-tier module. Note 3 says jobs queued from then on use the new recipes.

`components.schemas.JobView.properties.recipe` is `type: string` with no `description`, `pattern`, `enum`, or example. The same bare string is `CraftJobResponse.recipe`, `CraftQuoteResponse.recipe`, and `CraftingJobUpdate.recipe`. `CraftQueueResponse.jobs` items are `JobView`. `Recipe.id` calls the catalog id stable and does not mention `complete_queued_`. A search of `spacemolt-docs/openapi.json` finds no `complete_queued` string. `spacemolt-docs/catalog.json` recipe ids contain none either (those ids are not catalog entries).

CLI assumption: `src/display/generic.ts` keeps printing the server `recipe` string unchanged (`craftJobRows` spreads the job; the Recipe column is `['recipe']`; `emitOptionalValue('Recipe', r.recipe)`). `formatCraftingJobPreview` in `src/notification-format-shared.ts` keeps printing `job.recipe` via `safeScalar`. Help documents the pattern only. No rewrite to `build_<module>`, no enum, no lookup of `complete_queued_autocannon_ii_order`.

### 4. "43 recipes" and the three cost exceptions are not in the spec or the catalog shape

`spacemolt-docs/changelog.json` release `0.637.0`, note 2:

> These recipes need fewer of their other components, so the total material cost of each tier stays about the same. Mining Laser II, Afterburner III and Plasma Cannon IV now cost more in total.

Note 1's "43 recipes changed" is not a list. OpenAPI has no cost-delta field. `spacemolt-docs/catalog.json` at `0.637.3` has current inputs only (for example `build_mining_laser_ii` includes `mining_laser_i`, `build_afterburner_iii` includes `afterburner_ii`, `build_plasma_cannon_iv` includes `plasma_cannon_iii`) and no before/after cost.

A roman-tier count of that file is not the changelog's 43. Of recipes whose first output is a slotted module with a roman suffix of II or higher, 69 exist; 66 include the previous roman-suffix item id as an input. The other three have no such previous item id: `build_hyper_mining_laser_iii` (no `hyper_mining_laser_ii` item), `build_quantum_shield_iv` (no `quantum_shield_iii` item), and `upgrade_deep_core_extractor` (outputs `deep_core_extractor_ii`, inputs `deep_core_extractor_mk_i`). The catalog does not label any of these as outside the 0.637.0 change.

CLI assumption: the help sentence does not list 43 recipes, does not name Mining Laser II, Afterburner III, or Plasma Cannon IV, and does not special-case the three catalog ids above. A pilot reads one recipe's `inputs` with `catalog type=recipes`. The sentence is the changelog rule, not a catalog validator.
