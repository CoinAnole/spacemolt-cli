import { c, emitLine, firstArray, formatter, isRecord, namedFormatter, printCompactTable } from './helpers.ts';

function formatTimestampPreview(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/.exec(text);
  return match ? `${match[1]} ${match[2]}` : text;
}

function firstLinePreview(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).split(/\r?\n/, 1)[0]?.trim() ?? '';
}

function captainLogRows(result: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(result.entries)) return result.entries.filter(isRecord);
  if (Array.isArray(result.logs)) return result.logs.filter(isRecord);
  if (isRecord(result.entry)) return [result.entry];
  return undefined;
}

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

  // Chat history
  formatter(
    (r) => {
      if (!Array.isArray(r.messages)) return false;
      const rows = r.messages.filter(isRecord).map((message) => ({
        ...message,
        timestamp_preview: formatTimestampPreview(message.timestamp ?? message.created_at ?? message.sent_at),
      }));
      if (r.channel) emitLine(`${c.dim}channel ${r.channel}${c.reset}`);
      printCompactTable(
        'Messages',
        rows,
        [
          ['Timestamp', ['timestamp_preview', 'timestamp', 'created_at', 'sent_at']],
          ['Sender', ['sender', 'username', 'sender_name']],
          ['Message', ['content', 'message', 'text']],
        ],
        { maxCellWidth: 80 },
      );
      if (r.has_more) emitLine(`${c.dim}More messages available.${c.reset}`);
      return true;
    },
    { commands: ['get_chat_history'] },
  ),

  // Captain's log list
  formatter(
    (r) => {
      const entries = captainLogRows(r);
      if (!entries) return false;
      const rows = entries.map((entry) => ({
        ...entry,
        created_preview: formatTimestampPreview(entry.created_at ?? entry.timestamp ?? entry.date),
        entry_preview: firstLinePreview(entry.entry ?? entry.content ?? entry.text),
      }));
      emitLine(`${c.dim}log captain${c.reset}`);
      printCompactTable(
        'Entries',
        rows,
        [
          ['Index', ['index']],
          ['Date', ['created_preview', 'created_at', 'timestamp', 'date']],
          ['Entry', ['entry_preview', 'entry', 'content', 'text']],
        ],
        { maxCellWidth: 72 },
      );
      if (r.has_next || r.has_more) emitLine(`${c.dim}More entries available.${c.reset}`);
      return true;
    },
    { commands: ['captains_log_list'] },
  ),

  // Action log
  formatter(
    (r) => {
      if (!Array.isArray(r.entries)) return false;
      const category = r.category || 'all';
      const rows = r.entries.filter(isRecord).map((entry) => ({
        ...entry,
        timestamp_preview: formatTimestampPreview(entry.created_at ?? entry.timestamp),
        category: entry.category ?? category,
      }));
      emitLine(`${c.dim}category ${category}${c.reset}`);
      printCompactTable(
        'Entries',
        rows,
        [
          ['Timestamp', ['timestamp_preview', 'created_at', 'timestamp']],
          ['Summary', ['summary', 'message', 'description']],
          ['Category', ['category']],
        ],
        { maxCellWidth: 80 },
      );
      if (r.has_more) emitLine(`${c.dim}More entries available.${c.reset}`);
      return true;
    },
    { commands: ['get_action_log'] },
  ),

  formatter(
    (r) => {
      if (!r.id || !r.name || !r.tag || r.leader_username === undefined || r.member_count === undefined) return false;
      const title = `${r.name} [${r.tag}]`;
      emitLine(`\n${c.bright}=== Faction: ${title} ===${c.reset}`);
      emitLine(`ID: ${r.id}`);
      emitLine(`Leader: ${r.leader_username}`);
      emitLine(`Members: ${r.member_count}`);
      if (r.owned_bases !== undefined) emitLine(`Owned Bases: ${r.owned_bases}`);
      if (r.treasury !== undefined) emitLine(`Treasury: ${r.treasury}`);
      if (typeof r.description === 'string' && r.description) emitLine(`Description: ${r.description}`);
      if (typeof r.charter === 'string' && r.charter) emitLine(`Charter: ${r.charter}`);

      const facilities = firstArray(r, ['facilities']);
      if (facilities) {
        printCompactTable('Faction Facilities', facilities, [
          ['Name', ['name', 'type_name', 'facility_type', 'type']],
          ['ID', ['facility_id', 'id']],
          ['Base', ['base_id', 'base_name']],
          ['Service', ['faction_service']],
          ['Active', ['active', 'enabled', 'status']],
        ]);
      }
      return true;
    },
    { commands: ['faction_info'] },
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

  // Facility List
  namedFormatter(
    'facility_list',
    ['station_facilities', 'player_facilities', 'faction_facilities'],
    (r) => {
      const groups: Array<[string, Array<Record<string, unknown>> | undefined]> = [
        ['Station Facilities', firstArray(r, ['station_facilities'])],
        ['Player Facilities', firstArray(r, ['player_facilities'])],
        ['Faction Facilities', firstArray(r, ['faction_facilities'])],
      ];
      if (!groups.some(([, rows]) => Array.isArray(rows))) return false;

      if (r.base_id) emitLine(`\n${c.bright}=== Facilities at ${r.base_id} ===${c.reset}`);
      for (const [title, rows] of groups) {
        if (!rows) continue;
        printCompactTable(title, rows, [
          ['Name', ['name', 'type_name', 'facility_type', 'type']],
          ['ID', ['facility_id', 'id']],
          ['Category', ['category']],
          ['Active', ['active', 'enabled', 'status']],
          ['Maint', ['maintenance_satisfied']],
          ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
        ]);
      }
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
      printCompactTable('Categories', categories, [
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
        printCompactTable('Members', members, [
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
