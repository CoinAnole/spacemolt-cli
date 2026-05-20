import { c, emitLine, firstArray, isRecord, namedFormatter, printCompactTable } from './helpers.ts';

export const socialFormatters = [
  // Chat confirmation
  namedFormatter(
    'chat_sent',
    ['content'],
    (r) => {
      const channel = r.channel || r.target;
      if (!channel || (r.action && r.action !== 'chat')) return false;
      if (!r.action && !r.message && !r.content && !r.sent_at && !r.timestamp) return false;
      if (r.message || r.content) {
        const timestamp = r.sent_at || r.timestamp;
        const time = timestamp ? `${c.dim}${new Date(timestamp as string).toLocaleTimeString()}${c.reset} ` : '';
        emitLine(`${c.green}[${channel}]${c.reset} ${time}${r.message || r.content}`);
      } else {
        emitLine(`${c.green}Chat sent:${c.reset} ${channel}`);
      }
      if (r.warning) emitLine(`${c.yellow}Warning:${c.reset} ${r.warning}`);
      return true;
    },
    { commands: ['chat'], shapeFallback: true },
  ),

  // Facilities
  namedFormatter(
    'facilities',
    ['facilities'],
    (r) => {
      const facilities = firstArray(r, ['facilities', 'facility_types', 'upgrades']);
      if (!facilities) return false;
      printCompactTable('Facilities', facilities, [
        ['Name', ['name', 'type_name', 'facility_type']],
        ['ID', ['facility_id', 'id', 'type_id']],
        ['Level', ['level', 'tier']],
        ['Status', ['status', 'enabled', 'active']],
        ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
      ]);
      return true;
    },
    { commands: ['facility_list'], shapeFallback: true },
  ),

  // Facility Types
  namedFormatter(
    'facility_types',
    ['categories', 'total'],
    (r) => {
      if (!r.categories || !isRecord(r.categories)) return false;
      const categories = Object.entries(r.categories).map(([category, raw]) => ({
        category,
        ...(isRecord(raw) ? raw : { description: String(raw) }),
      }));
      printCompactTable('Facility Type Categories', categories, [
        ['Category', ['category']],
        ['Count', ['count']],
        ['Buildable', ['buildable']],
        ['Description', ['description']],
      ]);
      if (r.total !== undefined) emitLine(`\nTotal facility types: ${r.total}`);
      if (r.hint) emitLine(`\n${r.hint}`);
      return true;
    },
    { commands: ['facility_types'], shapeFallback: true },
  ),

  // Facility Get
  namedFormatter(
    'facility',
    ['facility'],
    (r) => {
      const facility = r.facility as Record<string, unknown> | undefined;
      if (!facility) return false;
      printCompactTable(
        'Facility',
        [facility],
        [
          ['Name', ['name', 'type_name', 'facility_type']],
          ['ID', ['facility_id', 'id']],
          ['Level', ['level', 'tier']],
          ['Status', ['status', 'enabled', 'active']],
          ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
        ],
      );
      return true;
    },
    { commands: ['facility_get'], shapeFallback: true },
  ),

  // Fleet Status
  namedFormatter(
    'fleet',
    ['fleet'],
    (r) => {
      const fleet = r.fleet as Record<string, unknown> | undefined;
      if (!fleet) return false;
      emitLine(`\n${c.bright}=== Fleet ===${c.reset}`);
      emitLine(`ID: ${fleet.fleet_id || fleet.id || 'unknown'}`);
      if (fleet.leader_name || fleet.leader_id) emitLine(`Leader: ${fleet.leader_name || fleet.leader_id}`);
      const members = (fleet.members || r.members) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(members)) {
        printCompactTable('Fleet Members', members, [
          ['Name', ['username', 'name', 'player_name']],
          ['ID', ['player_id', 'id']],
          ['Ship', ['ship_class', 'ship_name']],
          ['Location', ['system_name', 'current_system', 'poi_name', 'current_poi']],
          ['Status', ['status', 'state']],
        ]);
      }
      return true;
    },
    { commands: ['fleet_status'], shapeFallback: true },
  ),

  // Battle Status
  namedFormatter(
    'battle_status',
    ['battle'],
    (r) => {
      const battle = r.battle as Record<string, unknown> | undefined;
      if (!battle) return false;
      emitLine(`\n${c.bright}=== Battle ===${c.reset}`);
      emitLine(`ID: ${battle.battle_id || battle.id || 'unknown'}`);
      if (battle.status || battle.phase) emitLine(`Status: ${battle.status || battle.phase}`);
      if (battle.range_band || battle.range) emitLine(`Range: ${battle.range_band || battle.range}`);
      const participants = (battle.participants || r.participants) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(participants)) {
        printCompactTable('Participants', participants, [
          ['Name', ['username', 'name', 'player_name']],
          ['ID', ['player_id', 'id']],
          ['Side', ['side_id', 'side']],
          ['Stance', ['stance']],
          ['Target', ['target_name', 'target_id']],
        ]);
      }
      return true;
    },
    { commands: ['get_battle_status'], shapeFallback: true },
  ),
];
