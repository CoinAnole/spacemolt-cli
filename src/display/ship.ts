import {
  c,
  emitLine,
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

export const shipFormatters = [
  // Cargo
  namedFormatter(
    'cargo',
    ['cargo'],
    (r, command) => {
      const isCargoCommand = command === 'get_cargo' || command === 'v2_get_cargo';
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
      if (r.fuel_price !== undefined) emitLine(`Fuel Price: ${r.fuel_price} credits`);

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

      if (base.description) emitLine(`\n${base.description}`);
      return true;
    },
    { commands: ['get_base'], shapeFallback: true },
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
          emitLine(`\n${c.yellow}Wreck: ${w.wreck_id}${c.reset}`);
          emitLine(`  Ship: ${w.ship_class}`);
          emitLine(`  Expires in: ${w.ticks_remaining} ticks`);
          const items = (w.items as Array<Record<string, unknown>>) || [];
          if (items.length) {
            emitLine(`  Contents:`);
            for (const item of items) emitLine(`    - ${item.quantity}x ${item.item_id}`);
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
      printCompactTable('Drones', drones, [
        ['Name', ['name', 'type_name', 'drone_type', 'item_id']],
        ['ID', ['drone_id', 'id']],
        ['Status', ['status', 'state']],
        ['Location', ['poi_name', 'poi_id', 'location', 'base_id']],
        ['Cargo', ['cargo_used', 'cargo']],
      ]);
      return true;
    },
    { commands: ['list_drones'], shapeFallback: true },
  ),

  // Drone
  namedFormatter(
    'drone',
    ['drone'],
    (r) => {
      const drone = r.drone as Record<string, unknown> | undefined;
      if (!drone) return false;
      printCompactTable(
        'Drone',
        [drone],
        [
          ['Name', ['name', 'type_name', 'drone_type', 'item_id']],
          ['ID', ['drone_id', 'id']],
          ['Status', ['status', 'state']],
          ['Location', ['poi_name', 'poi_id', 'location', 'base_id']],
        ],
      );
      if (drone.script || r.script) emitLine(`\n${c.bright}Script:${c.reset}\n${drone.script || r.script}`);
      return true;
    },
    { commands: ['get_drone'], shapeFallback: true },
  ),
];
