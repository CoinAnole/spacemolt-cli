import {
  emitCatalogItemDetail,
  emitCatalogModuleDetail,
  emitCatalogShipDetail,
  packageOperationLabel,
} from './catalog-detail.ts';
import {
  c,
  emitLine,
  emitStationConstruction,
  emitStationDefences,
  emitStationFuelPricing,
  emitStationIds,
  emitStationLifeSupport,
  emitStationPower,
  formatter,
  isRecord,
  printCompactTable,
  type ResultFormatter,
} from './helpers.ts';

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function formatFactionLike(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const name = text(value.name);
  const tag = text(value.tag);
  const id = text(value.id);
  if (name && tag) return `${name} [${tag}]`;
  if (name) return name;
  if (tag) return tag;
  return id;
}

function formatOwner(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const type = text(value.type);
  const name = formatFactionLike(value) ?? text(value.id);
  if (!name) return undefined;
  return type ? `${name} (${type})` : name;
}

function formatCreator(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const username = text(value.username);
  const playerId = text(value.player_id);
  const who = username ?? playerId;
  const faction = formatFactionLike(value.faction);
  if (who && faction) return `${who} / ${faction}`;
  return who ?? faction;
}

function formatPosition(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const x = value.x;
  const y = value.y;
  if (x === undefined || y === undefined) return undefined;
  return `(${x}, ${y})`;
}

function summarizeItemQuantities(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map((item) => `${item.quantity ?? '?'}× ${text(item.name) ?? text(item.item_id) ?? text(item.id) ?? '?'}`)
    .join(', ');
}

function emitOptionalLine(label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  emitLine(`${label}: ${String(value)}`);
}

// byte-identical to shipping.ts formatCredits / formatTicks / formatBoolean
function formatCredits(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return `${value.toLocaleString()} cr`;
}

function formatTicks(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return `${value.toLocaleString()} ticks`;
}

function formatBoolean(value: unknown): string | undefined {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return undefined;
}

/**
 * Destination: `name / system (base_id)` so required destination_base_id stays
 * visible for docking/commands when labels are present (design formatDestination).
 * Strings are rendered as-is from the API (no title-casing).
 */
function formatShipmentDestination(shipment: Record<string, unknown>): string | undefined {
  const name = text(shipment.destination_name);
  const system = text(shipment.destination_system);
  const baseId = text(shipment.destination_base_id);

  const parts: string[] = [];
  if (name) parts.push(name);
  if (system) parts.push(system);

  if (parts.length && baseId) return `${parts.join(' / ')} (${baseId})`;
  if (baseId) return baseId;
  if (parts.length) return parts.join(' / ');
  return undefined;
}

/**
 * OpenAPI InspectPackageShipment — freight contract summary when a sealed package
 * is under an active shipment. Optional nested `package.shipment`.
 * Suppress bare Shipment heading when zero fields format (empty/unrenderable record).
 */
function emitPackageShipment(shipment: Record<string, unknown>): void {
  const lines: string[] = [];
  const push = (label: string, value: string | undefined): void => {
    if (value === undefined || value === '') return;
    lines.push(`${label}: ${value}`);
  };

  // Field order: ids → destination → credits → ticks → late (design example fragment)
  push('Contract', text(shipment.shipment_id));
  push('Status', text(shipment.status));
  push('Role', text(shipment.role));
  push('Destination', formatShipmentDestination(shipment));
  push('Base reward', formatCredits(shipment.base_reward));
  push('Payout if delivered now', formatCredits(shipment.payout_if_delivered_now));
  push('Failure debt', formatCredits(shipment.failure_debt));
  push('Late fee if delivered now', formatCredits(shipment.late_fee_if_delivered_now));
  push('Ticks to deadline', formatTicks(shipment.ticks_to_deadline));
  push('Ticks to recovery deadline', formatTicks(shipment.ticks_to_recovery_deadline));
  const late = formatBoolean(shipment.late);
  if (late !== undefined) lines.push(`Late: ${late}`);

  if (!lines.length) return;
  emitLine(`\n${c.bright}Shipment${c.reset}`);
  for (const line of lines) emitLine(line);
}

function emitInspectHeader(result: Record<string, unknown>): void {
  const id = text(result.id) ?? 'unknown';
  emitLine(`\n${c.bright}=== Inspect: ${id} ===${c.reset}`);
  const kind = text(result.kind);
  if (kind) emitLine(`Kind: ${kind}`);
  const source = text(result.source);
  if (source) emitLine(`Source: ${source}`);
}

function emitPackage(pkg: Record<string, unknown>): void {
  const label = text(pkg.label);
  const packageId = text(pkg.package_id);
  emitLine(`\n${c.bright}Package${label ? `: ${label}` : ''}${c.reset}`);
  if (packageId) emitLine(`ID: ${packageId}`);
  if (pkg.size !== undefined) emitLine(`Size: ${pkg.size}`);
  const createdAt = text(pkg.created_at);
  if (createdAt) emitLine(`Created: ${createdAt}`);
  const owner = formatOwner(pkg.owner);
  if (owner) emitLine(`Owner: ${owner}`);
  const creator = formatCreator(pkg.creator);
  if (creator) emitLine(`Creator: ${creator}`);

  // Package-level logistics metadata before inventory rows
  if (isRecord(pkg.shipment)) {
    emitPackageShipment(pkg.shipment);
  }

  const contents = Array.isArray(pkg.contents) ? pkg.contents.filter(isRecord) : [];
  if (contents.length) {
    printCompactTable(
      'Contents',
      contents,
      [
        ['Name', ['name', 'item_id']],
        ['Item', ['item_id']],
        ['Qty', ['quantity']],
        ['Size', ['size']],
      ],
      { maxCellWidth: 48 },
    );
  } else {
    emitLine('Contents: (empty)');
  }
}

function emitSystem(system: Record<string, unknown>, factionIntel: unknown): void {
  emitLine(`\n${c.bright}System: ${text(system.name) ?? text(system.system_id) ?? 'unknown'}${c.reset}`);
  if (system.system_id) emitLine(`ID: ${system.system_id}`);
  if (system.empire !== undefined) emitLine(`Empire: ${system.empire || 'None'}`);
  if (system.online !== undefined) emitLine(`Online: ${system.online}`);
  if (system.poi_count !== undefined) emitLine(`POIs: ${system.poi_count}`);
  const position = formatPosition(system.position);
  if (position) emitLine(`Position: ${position}`);
  if (system.visited !== undefined) emitLine(`Visited: ${system.visited}`);
  const visitedAt = text(system.visited_at);
  if (visitedAt) emitLine(`Visited at: ${visitedAt}`);
  if (Array.isArray(system.connections) && system.connections.length) {
    emitLine(`Connections: ${system.connections.map(String).join(', ')}`);
  }
  if (typeof system.description === 'string' && system.description.trim()) {
    emitLine(`\n${system.description.trim()}`);
  }

  if (isRecord(factionIntel)) {
    emitLine(`\n${c.bright}Faction intel${c.reset}`);
    const intelName = text(factionIntel.name);
    if (intelName) emitLine(`Name: ${intelName}`);
    if (factionIntel.empire !== undefined) emitLine(`Empire: ${factionIntel.empire || 'None'}`);
    if (Array.isArray(factionIntel.pois) && factionIntel.pois.length) {
      const names = factionIntel.pois
        .filter(isRecord)
        .map((poi) => text(poi.name) ?? text(poi.id))
        .filter(Boolean)
        .slice(0, 12);
      if (names.length) {
        const suffix = factionIntel.pois.length > 12 ? `, ... and ${factionIntel.pois.length - 12} more` : '';
        emitLine(`Known POIs (${factionIntel.pois.length}): ${names.join(', ')}${suffix}`);
      } else {
        emitLine(`Known POIs: ${factionIntel.pois.length}`);
      }
    }
  }
}

function emitPoi(poi: Record<string, unknown>, factionIntel: unknown): void {
  const summary = isRecord(poi.summary) ? poi.summary : undefined;
  const detail = isRecord(poi.detail) ? poi.detail : undefined;
  const detailPoi = isRecord(detail?.poi) ? detail.poi : undefined;

  const name =
    text(summary?.name) ?? text(detailPoi?.name) ?? text(poi.name) ?? text(summary?.id) ?? text(detailPoi?.id) ?? 'POI';
  const id = text(summary?.id) ?? text(detailPoi?.id) ?? text(poi.id);
  const poiClass = text(summary?.class) ?? text(summary?.type) ?? text(detailPoi?.class) ?? text(detailPoi?.type);

  emitLine(`\n${c.bright}POI: ${name}${c.reset}`);
  if (id) emitLine(`ID: ${id}`);
  if (poiClass) emitLine(`Class: ${poiClass}`);
  if (summary?.online !== undefined) emitLine(`Online: ${summary.online}`);
  const position = formatPosition(summary?.position ?? detailPoi?.position);
  if (position) emitLine(`Position: ${position}`);

  if (summary?.has_base === true || summary?.base_name || summary?.base_id) {
    const baseName = text(summary?.base_name) ?? text(summary?.base_id);
    emitLine(`Base: ${baseName ?? 'yes'}`);
  }

  const description = text(detailPoi?.description) ?? text(summary?.description) ?? text(poi.description);
  if (description) emitLine(`\n${description}`);

  if (Array.isArray(detail?.services) && detail.services.length) {
    const services = detail.services.map(String).slice(0, 12);
    const suffix = detail.services.length > 12 ? `, ... and ${detail.services.length - 12} more` : '';
    emitLine(`Services: ${services.join(', ')}${suffix}`);
  }

  if (isRecord(detail?.active_battle)) {
    const battleId = text(detail.active_battle.battle_id);
    if (battleId) emitLine(`Active battle: ${battleId}`);
  }

  const resources = Array.isArray(detail?.resources)
    ? detail.resources.filter(isRecord)
    : Array.isArray(summary?.resources)
      ? summary.resources.filter(isRecord)
      : [];
  if (resources.length) {
    printCompactTable(
      'Resources',
      resources,
      [
        ['Resource', ['resource_id', 'name', 'id']],
        ['Remaining', ['remaining_display', 'remaining']],
        ['Richness', ['richness']],
      ],
      { maxCellWidth: 40 },
    );
  }

  if (detail?.wormhole_destination_id || detail?.wormhole_destination) {
    emitLine(
      `Wormhole: ${text(detail.wormhole_destination) ?? text(detail.wormhole_destination_id) ?? 'unknown'}${
        detail.wormhole_expires_in !== undefined ? ` (expires in ${detail.wormhole_expires_in})` : ''
      }`,
    );
  }

  if (isRecord(factionIntel)) {
    emitLine(`\n${c.bright}Faction intel${c.reset}`);
    const intelName = text(factionIntel.name);
    if (intelName) emitLine(`Name: ${intelName}`);
    if (factionIntel.class) emitLine(`Class: ${factionIntel.class}`);
    if (factionIntel.base_name || factionIntel.base_id) {
      emitLine(`Base: ${text(factionIntel.base_name) ?? text(factionIntel.base_id)}`);
    }
    if (typeof factionIntel.description === 'string' && factionIntel.description.trim()) {
      emitLine(factionIntel.description.trim());
    }
  }
}

function emitBase(basePayload: Record<string, unknown>): void {
  const base = isRecord(basePayload.base) ? basePayload.base : basePayload;
  if (!isRecord(base)) return;

  emitLine(`\n${c.bright}Station: ${base.name || base.id}${c.reset}`);
  emitStationIds(base, '');
  emitLine(`Empire: ${base.empire || 'None'}`);
  if (base.faction_id) emitLine(`Faction: ${base.faction_id}`);
  emitStationDefences(base);
  if (base.fuel !== undefined || base.max_fuel !== undefined) {
    emitLine(`Fuel: ${base.fuel ?? '?'}/${base.max_fuel ?? '?'}`);
  }
  emitStationFuelPricing(basePayload);
  emitStationPower(basePayload.power);
  emitStationLifeSupport(basePayload.life_support);

  const condition = isRecord(basePayload.condition) ? basePayload.condition : undefined;
  if (condition) {
    emitLine(
      `Condition: ${condition.condition_text || condition.condition || 'unknown'} (${condition.satisfaction_pct ?? '?'}% satisfaction)`,
    );
  }

  const services = basePayload.services;
  if (Array.isArray(services) && services.length) emitLine(`Services: ${services.join(', ')}`);

  const facilities = base.facilities;
  if (Array.isArray(facilities)) {
    emitLine(`Facilities: ${facilities.length}`);
    const preview = facilities.slice(0, 12).join(', ');
    if (preview) {
      const suffix = facilities.length > 12 ? `, ... and ${facilities.length - 12} more` : '';
      emitLine(`  ${preview}${suffix}`);
    }
  }

  emitStationConstruction(basePayload.construction);

  if (typeof base.description === 'string' && base.description.trim()) {
    emitLine(`\n${base.description.trim()}`);
  }
}

function emitCatalogRecipeDetail(recipe: Record<string, unknown>): void {
  emitLine(`\n${c.bright}Details${c.reset}`);
  const description = text(recipe.description);
  if (description) emitLine(description);

  const inputs = summarizeItemQuantities(recipe.inputs);
  if (inputs) emitLine(`Inputs: ${inputs}`);
  const outputs = summarizeItemQuantities(recipe.outputs);
  if (outputs) emitLine(`Outputs: ${outputs}`);
  emitOptionalLine('Crafting time', recipe.crafting_time);
  if (recipe.facility_only === true) emitLine('Facility only: yes');
  const packageOperation = packageOperationLabel(recipe.package_operation);
  if (packageOperation) emitLine(`Package operation: ${packageOperation}`);
}

function emitCatalog(catalog: Record<string, unknown>): void {
  const catalogType = text(catalog.type) ?? 'catalog';
  emitLine(`\n${c.bright}Catalog (${catalogType})${c.reset}`);
  if (catalog.message) emitLine(String(catalog.message));

  const items = Array.isArray(catalog.items) ? catalog.items.filter(isRecord) : [];
  const recipes = Array.isArray(catalog.recipes) ? catalog.recipes.filter(isRecord) : [];

  if (items.length) {
    const columns: Array<[string, string[]]> =
      catalogType === 'ships'
        ? [
            ['Name', ['name', 'class_name', 'id']],
            ['ID', ['id', 'item_id', 'class_id']],
            ['Class', ['class', 'category']],
            ['Tier', ['tier']],
            ['Empire', ['empire', 'faction']],
          ]
        : [
            ['Name', ['name', 'class_name', 'id']],
            ['ID', ['id', 'item_id', 'recipe_id']],
            ['Category', ['category', 'type']],
            ['Size', ['size']],
            ['Value', ['base_value']],
          ];
    if (catalogType !== 'ships' && items.length === 1 && typeof items[0]?.slot === 'string') {
      columns.push(['Slot', ['slot']]);
    }
    printCompactTable(items.length === 1 ? 'Entry' : 'Entries', items, columns, { maxCellWidth: 48 });
    const entry = items.length === 1 ? items[0] : undefined;
    if (entry) {
      if (catalogType === 'ships') emitCatalogShipDetail(entry, catalog);
      else if (catalogType === 'items' && typeof entry.slot === 'string') emitCatalogModuleDetail(entry, catalog);
      else emitCatalogItemDetail(entry, catalog);
    }
  }

  if (recipes.length) {
    printCompactTable(
      'Recipes',
      recipes,
      [
        ['Name', ['name', 'id']],
        ['ID', ['id', 'recipe_id']],
        ['Category', ['category']],
        ['Time', ['crafting_time']],
      ],
      { maxCellWidth: 48 },
    );
    if (recipes.length === 1 && recipes[0]) emitCatalogRecipeDetail(recipes[0]);
  }

  if (isRecord(catalog.analysis)) {
    emitLine(`\n${c.bright}Analysis${c.reset}`);
    const raw = Array.isArray(catalog.analysis.raw_materials) ? catalog.analysis.raw_materials.filter(isRecord) : [];
    if (raw.length) {
      const summary = raw
        .map((row) => `${row.quantity ?? '?'}× ${text(row.name) ?? text(row.item_id) ?? '?'}`)
        .join(', ');
      emitLine(`Raw materials: ${summary}`);
    }
    if (catalog.estimated_material_cost !== undefined) {
      emitLine(`Estimated material cost: ${catalog.estimated_material_cost}`);
    }
  } else if (catalog.estimated_material_cost !== undefined) {
    emitLine(`Estimated material cost: ${catalog.estimated_material_cost}`);
  }

  if (catalog.page !== undefined || catalog.total_pages !== undefined || catalog.total !== undefined) {
    const page = catalog.page ?? '?';
    const totalPages = catalog.total_pages ?? '?';
    const total = catalog.total ?? '?';
    emitLine(`Page ${page}/${totalPages} (${total} total)`);
  }

  if (!items.length && !recipes.length && !isRecord(catalog.analysis)) {
    emitLine('(No catalog entries in this response)');
  }
}

function hasInspectPayload(result: Record<string, unknown>): boolean {
  return Boolean(
    result.kind !== undefined ||
      result.package !== undefined ||
      result.catalog !== undefined ||
      result.system !== undefined ||
      result.poi !== undefined ||
      result.base !== undefined,
  );
}

export const inspectFormatters: ResultFormatter[] = [
  formatter(
    (r) => {
      if (!hasInspectPayload(r)) return false;

      // Only claim the result when a specialized payload emitter can run.
      // Header-only matches would suppress the generic structured dump.
      if (isRecord(r.package)) {
        emitInspectHeader(r);
        emitPackage(r.package);
        return true;
      }
      if (isRecord(r.system)) {
        emitInspectHeader(r);
        emitSystem(r.system, r.faction_system_intel);
        return true;
      }
      if (isRecord(r.poi)) {
        emitInspectHeader(r);
        emitPoi(r.poi, r.faction_poi_intel);
        return true;
      }
      if (isRecord(r.base)) {
        emitInspectHeader(r);
        emitBase(r.base);
        return true;
      }
      if (isRecord(r.catalog)) {
        emitInspectHeader(r);
        emitCatalog(r.catalog);
        return true;
      }

      return false;
    },
    { commands: ['inspect'] },
  ),
];
