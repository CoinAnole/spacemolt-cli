import { emitShipCombatEffects } from './combat-effects.ts';
import {
  c,
  emitLine,
  emitStationConstruction,
  emitStationFuelPricing,
  emitStationPower,
  finiteNumber,
  firstArray,
  formatter,
  isRecord,
  namedFormatter,
  printCompactTable,
  printItemTable,
} from './helpers.ts';

function summarizeItemQuantities(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map((item) => `${item.quantity ?? '?'}x ${item.item_id ?? item.id ?? item.name ?? '?'}`)
    .join(', ');
}

function summarizePassiveRecipes(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.filter((recipe) => typeof recipe === 'string').join(', ');
}

function printPassiveRecipeTable(recipes: Array<Record<string, unknown>>): void {
  const rows = recipes.map((recipe) => ({
    ...recipe,
    inputs_summary: summarizeItemQuantities(recipe.inputs),
    outputs_summary: summarizeItemQuantities(recipe.outputs),
  }));
  printCompactTable(
    'Passive Recipes',
    rows,
    [
      ['Name', ['name']],
      ['ID', ['id', 'recipe_id']],
      ['Inputs', ['inputs_summary']],
      ['Outputs', ['outputs_summary']],
    ],
    { maxCellWidth: 56 },
  );
}

function preferPopulatedArray(
  primary: Array<Record<string, unknown>> | undefined,
  fallback: Array<Record<string, unknown>> | undefined,
): Array<Record<string, unknown>> | undefined {
  if (primary?.length) return primary;
  if (fallback?.length) return fallback;
  return primary ?? fallback;
}

function hasAnyDroneField(rows: Array<Record<string, unknown>>, fields: string[]): boolean {
  return rows.some((row) =>
    fields.some((field) => row[field] !== undefined && row[field] !== null && row[field] !== ''),
  );
}

function formatFuelDelta(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value > 0 ? `+${value}` : String(value);
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return finiteNumber(value);
}

function formatCredits(value: number): string {
  return `${value.toLocaleString()} cr`;
}

function formatPerFuel(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatShipLabel(result: Record<string, unknown>): string {
  const shipId = result.ship_id ?? result.item_id;
  const name = result.ship_name ?? result.custom_name ?? result.name ?? result.class_name;
  const classId = result.class_id;
  if (name !== undefined && name !== null && name !== '') {
    const classText = classId !== undefined && classId !== null && classId !== '' ? ` (${classId})` : '';
    return `${name}${classText}`;
  }
  return String(shipId ?? 'unknown');
}

function baySlotsLine(result: Record<string, unknown>): string | undefined {
  const remaining = finiteNumber(result.bay_slots_remaining ?? result.cargo_space);
  if (remaining === undefined) return undefined;

  const capacity = finiteNumber(result.bay_capacity ?? result.carrier_bay_capacity ?? result.bay_slots_capacity);
  if (capacity === undefined) return `Bay Slots Remaining: ${remaining}`;

  const used = Math.max(0, capacity - remaining);
  return `Bay Slots Used: ${used}/${capacity} (${remaining} remaining)`;
}

function droneTableColumns(rows: Array<Record<string, unknown>>, options: { includeCargo?: boolean } = {}) {
  const columns: Array<[string, string[]]> = [
    ['Name', ['name', 'type_name', 'drone_type', 'item_id', 'type']],
    ['ID', ['drone_id', 'id']],
    ['Type', ['type', 'drone_type', 'item_id']],
    ['Status', ['status', 'state']],
  ];
  if (hasAnyDroneField(rows, ['system_name', 'system_id', 'current_system'])) {
    columns.push(['System', ['system_name', 'system_id', 'current_system']]);
  }
  columns.push(['POI', ['poi_name', 'poi_id', 'current_poi', 'location', 'base_id']]);
  if (options.includeCargo) columns.push(['Cargo', ['cargo_used', 'cargo_pct', 'cargo']]);
  return columns;
}

export const shipFormatters = [
  formatter(
    (r) => {
      if (r.action !== 'deposit_items' && r.action !== 'load_ship_into_carrier_bay') return false;
      if (!r.ship_id && !r.item_id) return false;

      emitLine(`\n${c.bright}=== Load Ship Into Carrier Bay ===${c.reset}`);
      emitLine(`Ship: ${formatShipLabel(r)}`);
      const bayLine = baySlotsLine(r);
      if (bayLine) emitLine(bayLine);
      if (r.base_id || r.base_name) emitLine(`Base: ${r.base_name ?? r.base_id}`);
      if (r.message) emitLine(`${c.dim}${r.message}${c.reset}`);
      return true;
    },
    { commands: ['deposit_items_carrier_load'] },
  ),

  // Cargo
  namedFormatter(
    'cargo',
    ['cargo'],
    (r, command) => {
      const isCargoCommand = command === 'get_cargo';
      if (r.cargo === undefined && !isCargoCommand) return false;
      if (!isCargoCommand && r.used === undefined && r.cargo_used === undefined) {
        return false;
      }
      const cargo = Array.isArray(r.cargo) ? (r.cargo as Array<Record<string, unknown>>) : [];
      emitLine(`\n${c.bright}=== Cargo ===${c.reset}`);
      const used = r.used ?? r.cargo_used ?? (r.ship as Record<string, unknown> | undefined)?.cargo_used;
      const capacity =
        r.capacity ?? r.cargo_capacity ?? (r.ship as Record<string, unknown> | undefined)?.cargo_capacity;
      const available = r.available ?? r.cargo_available;
      if (used !== undefined || capacity !== undefined) {
        const suffix = available !== undefined ? ` (${available} available)` : '';
        emitLine(`Used: ${used ?? '?'}/${capacity ?? '?'}${suffix}\n`);
      }
      printItemTable(cargo, '  ', 'Cargo');
      return true;
    },
    { commands: ['get_cargo'], shapeFallback: true },
  ),

  // Ship status
  namedFormatter(
    'ship',
    ['ship', 'modules'],
    (r) => {
      const ship = r.ship as Record<string, unknown> | undefined;
      if (!ship || !isRecord(ship)) return false;

      emitLine(`\n${c.bright}=== Ship: ${ship.name || ship.custom_name || ship.class_name || ship.id} ===${c.reset}`);
      emitLine(`ID: ${ship.id || ship.ship_id || 'unknown'}`);
      emitLine(`Class: ${ship.class_name || ship.class_id || 'unknown'}`);
      if (ship.custom_name) emitLine(`Custom Name: ${ship.custom_name}`);
      emitLine(`Hull: ${ship.hull ?? '?'}/${ship.max_hull ?? '?'}`);
      emitLine(`Shield: ${ship.shield ?? '?'}/${ship.max_shield ?? '?'} (+${ship.shield_recharge ?? 0}/tick)`);
      emitLine(`Armor: ${ship.armor ?? 0}`);
      emitLine(`Fuel: ${ship.fuel ?? '?'}/${ship.max_fuel ?? '?'}`);
      emitLine(`Cargo: ${ship.cargo_used ?? '?'}/${ship.cargo_capacity ?? '?'}`);
      emitLine(`CPU: ${ship.cpu_used ?? '?'}/${ship.cpu_capacity ?? '?'}`);
      emitLine(`Power: ${ship.power_used ?? '?'}/${ship.power_capacity ?? '?'}`);
      emitLine(
        `Slots: ${ship.weapon_slots ?? 0} weapon, ${ship.defense_slots ?? 0} defense, ${ship.utility_slots ?? 0} utility`,
      );
      emitShipCombatEffects(ship);
      if (ship.last_process_tick !== undefined) emitLine(`Passive Processing: last tick ${ship.last_process_tick}`);
      const passiveRecipes = summarizePassiveRecipes(ship.passive_recipes ?? r.passive_recipes);
      if (passiveRecipes) emitLine(`Passive Recipes: ${passiveRecipes}`);

      const modules = preferPopulatedArray(firstArray(r, ['modules']), firstArray(ship, ['modules']));
      if (modules) {
        printCompactTable('Modules', modules, [
          ['Slot', ['slot']],
          ['Name', ['name', 'type_name']],
          ['Type', ['type', 'type_id']],
          ['Wear', ['wear_status', 'wear']],
          ['CPU', ['cpu_usage', 'cpu']],
          ['Power', ['power_usage', 'power']],
          ['Size', ['size']],
          ['ID', ['module_id', 'id']],
        ]);
      }
      const passiveRecipeDetails = firstArray(r, ['passive_recipe_details']);
      if (passiveRecipeDetails) printPassiveRecipeTable(passiveRecipeDetails);
      return true;
    },
    { commands: ['get_ship'], shapeFallback: true },
  ),

  // Base info
  namedFormatter(
    'base',
    ['base', 'services'],
    (r) => {
      const base = r.base as Record<string, unknown> | undefined;
      if (!base || !isRecord(base)) return false;

      emitLine(`\n${c.bright}=== Base: ${base.name || base.id} ===${c.reset}`);
      emitLine(`ID: ${base.id || base.base_id || 'unknown'}`);
      if (base.poi_id) emitLine(`POI: ${base.poi_id}`);
      emitLine(`Empire: ${base.empire || 'None'}`);
      emitLine(`Defense: ${base.defense_level ?? '?'}`);
      if (base.fuel !== undefined || base.max_fuel !== undefined)
        emitLine(`Fuel: ${base.fuel ?? '?'}/${base.max_fuel ?? '?'}`);
      emitStationFuelPricing(r);
      emitStationPower(r.power);

      const condition = r.condition as Record<string, unknown> | undefined;
      if (condition && isRecord(condition)) {
        emitLine(
          `Condition: ${condition.condition_text || condition.condition || 'unknown'} (${condition.satisfaction_pct ?? '?'}% satisfaction)`,
        );
      }

      const services = r.services as unknown;
      if (Array.isArray(services) && services.length) emitLine(`Services: ${services.join(', ')}`);

      const facilities = base.facilities as unknown;
      if (Array.isArray(facilities)) {
        emitLine(`Facilities: ${facilities.length}`);
        const preview = facilities.slice(0, 12).join(', ');
        if (preview) {
          const suffix = facilities.length > 12 ? `, ... and ${facilities.length - 12} more` : '';
          emitLine(`  ${preview}${suffix}`);
        }
      }

      emitStationConstruction(r.construction);

      if (base.description) emitLine(`\n${base.description}`);
      return true;
    },
    { commands: ['get_base'], shapeFallback: true },
  ),

  formatter(
    (r) => {
      if (r.action !== 'refuel' && r.fuel_now === undefined && r.target_fuel_now === undefined) return false;

      emitLine(`\n${c.bright}=== Refuel Complete ===${c.reset}`);
      if (r.source !== undefined) emitLine(`Source: ${r.source}`);

      const fuelDelta = formatFuelDelta(r.fuel);
      if (r.fuel_now !== undefined || r.fuel_max !== undefined || fuelDelta !== undefined) {
        const delta = fuelDelta === undefined ? '' : ` (${fuelDelta})`;
        emitLine(`Ship fuel: ${r.fuel_now ?? '?'}/${r.fuel_max ?? '?'}${delta}`);
      }

      const targetName = r.target_player_name ?? r.target_name;
      const targetId = r.target_player_id ?? r.target_id;
      if (targetName !== undefined || targetId !== undefined) {
        const idText = targetName !== undefined && targetId !== undefined ? ` (${targetId})` : '';
        emitLine(`Target: ${targetName ?? targetId}${idText}`);
      }
      if (r.target_fuel_now !== undefined || r.target_fuel_max !== undefined) {
        emitLine(`Target fuel: ${r.target_fuel_now ?? '?'}/${r.target_fuel_max ?? '?'}`);
      }

      const fuelCost = optionalNumber(r.cost);
      const fuelTax = optionalNumber(r.tax_amount);
      if (fuelCost !== undefined) emitLine(`Fuel cost: ${formatCredits(fuelCost)}`);
      if (fuelTax !== undefined) emitLine(`Fuel tax: ${formatCredits(fuelTax)}`);
      if (fuelCost !== undefined || fuelTax !== undefined) {
        const totalSpent = (fuelCost ?? 0) + (fuelTax ?? 0);
        const fuelAmount = optionalNumber(r.fuel);
        const unitText =
          fuelAmount !== undefined && fuelAmount > 0 ? ` (${formatPerFuel(totalSpent / fuelAmount)} cr/fuel)` : '';
        emitLine(`Total spent: ${formatCredits(totalSpent)}${unitText}`);
      }

      if (r.message) emitLine(`${c.dim}${r.message}${c.reset}`);
      return true;
    },
    { commands: ['refuel'] },
  ),

  formatter(
    (r) => {
      if (r.action !== 'reload' && r.weapon_id === undefined && r.current_ammo === undefined) return false;
      emitLine(`\n${c.bright}=== Reloaded ===${c.reset}`);
      if (r.weapon_name || r.weapon_id)
        emitLine(`Weapon: ${r.weapon_name ?? r.weapon_id}${r.weapon_id && r.weapon_name ? ` (${r.weapon_id})` : ''}`);
      if (r.ammo_name || r.ammo_id)
        emitLine(`Ammo: ${r.ammo_name ?? r.ammo_id}${r.ammo_id && r.ammo_name ? ` (${r.ammo_id})` : ''}`);
      if (r.previous_ammo !== undefined) emitLine(`Previous ammo: ${r.previous_ammo}`);
      if (r.current_ammo !== undefined) emitLine(`Current ammo: ${r.current_ammo}`);
      if (r.magazine_size !== undefined) emitLine(`Magazine size: ${r.magazine_size}`);
      if (r.rounds_discarded !== undefined) emitLine(`Rounds discarded: ${r.rounds_discarded}`);
      return true;
    },
    { commands: ['reload'] },
  ),

  formatter(
    (r) => {
      if (
        r.metal_scrap === undefined &&
        r.rare_materials === undefined &&
        r.components === undefined &&
        r.total_value === undefined &&
        r.xp_gained === undefined
      )
        return false;
      emitLine(`\n${c.bright}=== Salvage Complete ===${c.reset}`);
      if (r.metal_scrap !== undefined) emitLine(`Metal scrap: ${r.metal_scrap}`);
      if (r.rare_materials !== undefined) emitLine(`Rare materials: ${r.rare_materials}`);
      if (r.components !== undefined) emitLine(`Components: ${r.components}`);
      if (r.total_value !== undefined) emitLine(`Total value: ${r.total_value}`);
      if (r.xp_gained !== undefined) emitLine(`XP gained: ${r.xp_gained}`);
      return true;
    },
    { commands: ['salvage_wreck'] },
  ),

  // Wrecks
  formatter(
    (r) => {
      if (!Array.isArray(r.wrecks)) return false;
      const wrecks = r.wrecks as Array<Record<string, unknown>>;
      emitLine(`\n${c.bright}=== Wrecks at POI ===${c.reset}`);
      if (!wrecks.length) {
        emitLine(`(No wrecks at this location)`);
      } else {
        for (const w of wrecks) {
          const wreckId = w.id || w.wreck_id || 'unknown';
          const ship = [w.ship_name, w.ship_class].filter(Boolean).join(' / ') || 'unknown';
          const victim = w.victim_name ? ` (${w.victim_name})` : '';
          const cargo = Array.isArray(w.cargo)
            ? (w.cargo as Array<Record<string, unknown>>)
            : (w.items as Array<Record<string, unknown>>) || [];
          const modules = Array.isArray(w.modules) ? (w.modules as Array<Record<string, unknown>>) : [];

          emitLine(`\n${c.yellow}Wreck: ${wreckId}${c.reset}`);
          emitLine(`  Ship: ${ship}${victim}`);
          if (w.salvage_value !== undefined) emitLine(`  Salvage value: ${w.salvage_value}`);
          if (w.expire_tick !== undefined) {
            emitLine(`  Expires tick: ${w.expire_tick}`);
          } else if (w.ticks_remaining !== undefined) {
            emitLine(`  Expires in: ${w.ticks_remaining} ticks`);
          }
          if (w.expires_at !== undefined) emitLine(`  Expires at: ${w.expires_at}`);
          if (cargo.length) {
            emitLine(`  Cargo:`);
            for (const item of cargo) {
              const itemName = item.name || item.item_id || '?';
              emitLine(`    - ${item.quantity ?? '?'}x ${itemName}`);
            }
          }
          if (modules.length) {
            emitLine(`  Modules:`);
            for (const module of modules) {
              const moduleName = module.name || module.type_id || module.id || '?';
              emitLine(`    - ${moduleName}`);
            }
          }
        }
      }
      return true;
    },
    { commands: ['get_wrecks'], shapeFallback: true },
  ),

  // Drones
  namedFormatter(
    'drones',
    ['drones'],
    (r) => {
      const drones = firstArray(r, ['drones']);
      if (!drones) return false;
      printCompactTable('Drones', drones, droneTableColumns(drones, { includeCargo: true }));
      return true;
    },
    { commands: ['list_drones'], shapeFallback: true },
  ),

  // Drone
  namedFormatter(
    'drone',
    ['drone'],
    (r, command) => {
      const drone = isRecord(r.drone) ? r.drone : command === 'get_drone' ? r : undefined;
      if (!drone || (drone.drone_id === undefined && drone.id === undefined && drone.item_id === undefined)) {
        return false;
      }
      printCompactTable('Drone', [drone], droneTableColumns([drone]));
      if (drone.script || r.script) emitLine(`\n${c.bright}Script:${c.reset}\n${drone.script || r.script}`);
      return true;
    },
    { commands: ['get_drone'], shapeFallback: true },
  ),
];
