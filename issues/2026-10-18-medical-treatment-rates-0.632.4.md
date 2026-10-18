# SpaceMolt docs issues

Source log `/home/spacemolt/spacemolt-cli-source/docs_issues.md` was empty on 2026-10-18. No earlier complaints were carried. Each item below was checked against the cached spec in this worktree (`spacemolt-docs/openapi.json`, gameserver `current_version` 0.637.3) and the cited prose. No live gameserver call was made.

## 1. Facility-list prose omits medical treatment prices

- Status: open
- Found: 2026-10-18
- Gameserver: 0.632.4 (prices), 0.632.1 (fees cover supplies)

Conflict:

`spacemolt-docs/docs/stations.md` (Personnel and Medical Services):

> `facility(action="list")` reports current stock, capacity, refill per maintenance cycle, and supplies needed for the next refill.

`spacemolt-docs/skill.md` (Boarding, Personnel, and Intact Prizes):

> `facility(action="list")` reports current stock, capacity, refill per maintenance cycle, and the supplies demanded by the next refill.

`spacemolt-docs/openapi.json` `FacilityListResponse.properties.service_pools.description`:

> Finite shared station pools for personnel recruitment, marine training and medical treatment, with stock, refill rate and supply need; the medical pool also carries current per-patient treatment prices.

`spacemolt-docs/openapi.json` `StationServicePoolStatus.properties.crew_treatment_price.description`:

> Current credits per crew patient. Present for a medical pool. Covers supply cost or the configured minimum if higher. Treatment recalculates this price when executed.

`spacemolt-docs/changelog.json` 0.632.4:

> `facility action=list` `service_pools`: every field now has a description. The `medical` pool shows the patients the station can treat now, the supply items it needs for the next refill, and the current price per crew patient and per marine patient.

Complaint: `stations.md` and `skill.md` still describe `facility list` service pools as stock, capacity, refill, and supply need. They lag the 0.632.4 changelog and the OpenAPI `service_pools` description, which add the current per-patient medical prices.

## 2. `TreatPersonnelResponse.source` calls faction treatment the reserve

- Status: open
- Found: 2026-10-18

Conflict:

`spacemolt-docs/openapi.json` `TreatPersonnelResponse.properties.source.description`:

> Which medical supply paid for the treatment. station is the base infirmary. faction is your faction reserve. field is shipboard medical supplies.

`TreatPersonnelResponse.properties.medical_pool_remaining.description`:

> Treatment capacity left in the pool that paid, after this treatment. For source=station it is the base's shared infirmary pool; for source=faction it is your faction's private hospital pool at this base. Omitted entirely for source=field.

`POST /api/v2/spacemolt_ship/treat_personnel` operation description:

> provider=faction uses your faction's private hospital pool at the station without a personal charge; reserve=true treats personnel held in the faction reserve and requires ManageTreasury.

Complaint: `source=faction` is the private hospital pool in `medical_pool_remaining` and in the operation text. The `source` description calls that same enum value "your faction reserve". Reserve treatment is `reserve=true`, and `target` is then the literal `faction_reserve`. The opening clause "Which medical supply paid" also covers station treatment, which the `cost` description defines as a credit charge rather than a `medical_supplies` debit.

## 3. Station `medical_pool_remaining` is not defined as `service_pools.medical.remaining`

- Status: open
- Found: 2026-10-18

Conflict:

`StationServicePools.properties.medical.description`:

> Patients the station can treat here from its best operational medical facility, with crew_treatment_price and marine_treatment_price. Omitted when the station has none.

`StationServicePoolStatus.properties.remaining.description`:

> Units currently available to all visitors. Zero means this service pool is exhausted.

`TreatPersonnelResponse.properties.medical_pool_remaining.description`:

> Treatment capacity left in the pool that paid, after this treatment. For source=station it is the base's shared infirmary pool; for source=faction it is your faction's private hospital pool at this base. Omitted entirely for source=field. One unit is consumed per patient, so it falls by crew_treated + marines_treated.

Complaint: For `source=station` the two texts both talk about the station's shared medical capacity, and for `source=faction` the receipt field is explicitly the private hospital pool. The spec never says `medical_pool_remaining` is the same integer as a following or preceding `facility list` `service_pools.medical.remaining`. The CLI will print the receipt field under its own label and will not treat the two numbers as one counter.

## 4. Price properties sit on the shared pool schema

- Status: open
- Found: 2026-10-18

Conflict:

`StationServicePoolStatus.properties.crew_treatment_price.description` and `marine_treatment_price.description` each say "Present for a medical pool."

`StationServicePools` references that same schema for `personnel`, `medical`, and `marine_training`. `StationServicePoolStatus` sets `additionalProperties: false` and does not restrict the two price keys to `medical`.

Complaint: A personnel or marine-training pool object is schema-valid with `crew_treatment_price` and `marine_treatment_price` on it, while the descriptions say those keys belong to the medical pool. The CLI will format the prices only on the `medical` key.

## 5. Changelog 0.632.1 station COGS and showroom floor have no OpenAPI description

- Status: open
- Found: 2026-10-18
- Out of scope for the CLI medical-rate display change. Recorded because the changelog and the spec disagree by silence.

`spacemolt-docs/changelog.json` 0.632.1:

> Stations preserve the cost of goods already listed for sale when they buy more stock.

> Stale showroom ships still receive gradual discounts, but prices no longer fall below their recorded break-even floor.

Search of `spacemolt-docs/openapi.json` on 2026-10-18 found no `break-even`, `break_even`, or "already listed for sale". The only "cost of goods" strings are faction tax copy: `TaxEstimateResponse.properties.taxable_market_income.description` ("Market sales minus market cost of goods deducted in credits.") and the `get_faction_tax_estimate` operation description of deductible faction expenses. Neither describes station listing COGS preservation or a showroom break-even floor.

Complaint: Gameserver 0.632.1 documents two pricing rules that the cached OpenAPI does not describe. Clients cannot discover the preserved listing cost or the showroom floor from the spec.
