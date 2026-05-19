import { c, firstArray, printCompactTable, printItemTable } from '../runtime.ts';
import { formatter, isRecord, namedFormatter } from './helpers.ts';

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
      console.log(`\n${c.bright}=== Cargo ===${c.reset}`);
      const used = r.used ?? r.cargo_used ?? (r.ship as Record<string, unknown> | undefined)?.cargo_used;
      const capacity =
        r.capacity ?? r.cargo_capacity ?? (r.ship as Record<string, unknown> | undefined)?.cargo_capacity;
      const available = r.available ?? r.cargo_available;
      if (used !== undefined || capacity !== undefined) {
        const suffix = available !== undefined ? ` (${available} available)` : '';
        console.log(`Used: ${used ?? '?'}/${capacity ?? '?'}${suffix}\n`);
      }
      printItemTable(cargo);
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

      console.log(
        `\n${c.bright}=== Ship: ${ship.name || ship.custom_name || ship.class_name || ship.id} ===${c.reset}`,
      );
      console.log(`ID: ${ship.id || ship.ship_id || 'unknown'}`);
      console.log(`Class: ${ship.class_name || ship.class_id || 'unknown'}`);
      if (ship.custom_name) console.log(`Custom Name: ${ship.custom_name}`);
      console.log(`Hull: ${ship.hull ?? '?'}/${ship.max_hull ?? '?'}`);
      console.log(`Shield: ${ship.shield ?? '?'}/${ship.max_shield ?? '?'} (+${ship.shield_recharge ?? 0}/tick)`);
      console.log(`Armor: ${ship.armor ?? 0}`);
      console.log(`Fuel: ${ship.fuel ?? '?'}/${ship.max_fuel ?? '?'}`);
      console.log(`Cargo: ${ship.cargo_used ?? '?'}/${ship.cargo_capacity ?? '?'}`);
      console.log(`CPU: ${ship.cpu_used ?? '?'}/${ship.cpu_capacity ?? '?'}`);
      console.log(`Power: ${ship.power_used ?? '?'}/${ship.power_capacity ?? '?'}`);
      console.log(
        `Slots: ${ship.weapon_slots ?? 0} weapon, ${ship.defense_slots ?? 0} defense, ${ship.utility_slots ?? 0} utility`,
      );

      const modules = firstArray(r, ['modules']);
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

      console.log(`\n${c.bright}=== Base: ${base.name || base.id} ===${c.reset}`);
      console.log(`ID: ${base.id || base.base_id || 'unknown'}`);
      if (base.poi_id) console.log(`POI: ${base.poi_id}`);
      console.log(`Empire: ${base.empire || 'None'}`);
      console.log(`Defense: ${base.defense_level ?? '?'}`);
      if (base.fuel !== undefined || base.max_fuel !== undefined)
        console.log(`Fuel: ${base.fuel ?? '?'}/${base.max_fuel ?? '?'}`);
      if (r.fuel_price !== undefined) console.log(`Fuel Price: ${r.fuel_price} credits`);

      const condition = r.condition as Record<string, unknown> | undefined;
      if (condition && isRecord(condition)) {
        console.log(
          `Condition: ${condition.condition_text || condition.condition || 'unknown'} (${condition.satisfaction_pct ?? '?'}% satisfaction)`,
        );
      }

      const services = r.services as unknown;
      if (Array.isArray(services) && services.length) console.log(`Services: ${services.join(', ')}`);

      const facilities = base.facilities as unknown;
      if (Array.isArray(facilities)) {
        console.log(`Facilities: ${facilities.length}`);
        const preview = facilities.slice(0, 12).join(', ');
        if (preview) {
          const suffix = facilities.length > 12 ? `, ... and ${facilities.length - 12} more` : '';
          console.log(`  ${preview}${suffix}`);
        }
      }

      if (base.description) console.log(`\n${base.description}`);
      return true;
    },
    { commands: ['get_base'], shapeFallback: true },
  ),

  // Wrecks
  formatter(
    (r) => {
      if (!Array.isArray(r.wrecks)) return false;
      const wrecks = r.wrecks as Array<Record<string, unknown>>;
      console.log(`\n${c.bright}=== Wrecks at POI ===${c.reset}`);
      if (!wrecks.length) {
        console.log(`(No wrecks at this location)`);
      } else {
        for (const w of wrecks) {
          console.log(`\n${c.yellow}Wreck: ${w.wreck_id}${c.reset}`);
          console.log(`  Ship: ${w.ship_class}`);
          console.log(`  Expires in: ${w.ticks_remaining} ticks`);
          const items = (w.items as Array<Record<string, unknown>>) || [];
          if (items.length) {
            console.log(`  Contents:`);
            for (const item of items) console.log(`    - ${item.quantity}x ${item.item_id}`);
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
      if (drone.script || r.script) console.log(`\n${c.bright}Script:${c.reset}\n${drone.script || r.script}`);
      return true;
    },
    { commands: ['get_drone'], shapeFallback: true },
  ),
];
