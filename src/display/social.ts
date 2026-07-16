import {
  c,
  commandNameEquals,
  emitLine,
  emitStationConstruction,
  emitStationLifeSupport,
  emitStationPower,
  firstArray,
  formatter,
  isRecord,
  namedFormatter,
  printCompactTable,
} from './helpers.ts';

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

function emitOptionalLine(label: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  emitLine(`${label}: ${value}`);
}

function emitBody(title: string, value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  emitLine(`\n${c.bright}${title}:${c.reset}`);
  for (const line of value.split(/\r?\n/)) emitLine(line);
  return true;
}

function hasAnyField(rows: Array<Record<string, unknown>>, fields: string[]): boolean {
  return rows.some((row) =>
    fields.some((field) => row[field] !== undefined && row[field] !== null && row[field] !== ''),
  );
}

function formatNumber(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value).toLocaleString();
  }
  return undefined;
}

function formatCredits(value: unknown): string | undefined {
  const number = formatNumber(value);
  return number === undefined ? undefined : `${number}cr`;
}

function formatCycles(value: unknown): string | undefined {
  const number = formatNumber(value);
  if (number === undefined) return undefined;
  return `${number} ${Number(value) === 1 ? 'cycle' : 'cycles'}`;
}

function formatYesNo(value: unknown): string | undefined {
  if (typeof value !== 'boolean') return undefined;
  return value ? 'yes' : 'no';
}

function formatPercentValue(value: unknown): string | undefined {
  const number = formatNumber(value);
  return number === undefined ? undefined : `${number}%`;
}

function formatZoneCount(value: unknown): string | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return `${number.toLocaleString()} ${number === 1 ? 'zone' : 'zones'}`;
}

function formatMaintenance(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .filter(isRecord)
    .map((item) => {
      const quantity = formatNumber(item.quantity) ?? '?';
      const name = item.name ?? item.item_id ?? 'item';
      return `${quantity} ${name}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function facilityBaseName(row: Record<string, unknown>): string | undefined {
  for (const field of ['name', 'type_name', 'facility_type', 'type']) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function facilityDisplayName(row: Record<string, unknown>): string | undefined {
  const customName = typeof row.custom_name === 'string' ? row.custom_name.trim() : '';
  const baseName = facilityBaseName(row);
  if (!customName) return baseName;
  if (!baseName || customName === baseName) return customName;
  return `${customName} (${baseName})`;
}

function facilityProduction(row: Record<string, unknown>): Record<string, unknown> | undefined {
  return isRecord(row.production) ? row.production : undefined;
}

function facilityRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const production = facilityProduction(row);
    // Prefer top-level live fields when present; fall back to FacilityResponse list
    // production / recipe_id shapes from OpenAPI.
    const outputPricePerUnit = row.output_price_per_unit ?? production?.output_price_per_unit;
    const recipeId = row.configured_recipe_id ?? row.recipe_id ?? production?.recipe;
    return {
      ...row,
      name_display: facilityDisplayName(row),
      maintenance_display: formatMaintenance(row.maintenance_per_cycle),
      labor_cycle_display: formatCredits(row.labor_per_cycle),
      output_price_per_unit: outputPricePerUnit,
      output_price_per_unit_display: formatCredits(outputPricePerUnit),
      recipe_id: recipeId,
    };
  });
}

function facilityColumns(rows: Array<Record<string, unknown>>, options: { grouped?: boolean } = {}) {
  const columns: Array<[string, string[]]> = [
    ['Name', ['name_display', 'name', 'type_name', 'facility_type', 'type']],
    ['ID', ['facility_id', 'id', 'type_id']],
    ['Level', ['level', 'tier']],
  ];
  if (options.grouped) columns.push(['Category', ['category']]);
  // Live payloads sometimes include active/status; list schema uses damaged /
  // under_construction / power_throttled instead.
  if (hasAnyField(rows, ['active', 'enabled', 'status'])) {
    columns.push(
      options.grouped ? ['Active', ['active', 'enabled', 'status']] : ['Status', ['status', 'enabled', 'active']],
    );
  }
  if (options.grouped && hasAnyField(rows, ['maintenance_satisfied'])) {
    columns.push(['Maint', ['maintenance_satisfied']]);
  }
  if (hasAnyField(rows, ['damaged'])) {
    columns.push(['Damaged', ['damaged']]);
  }
  if (hasAnyField(rows, ['under_construction'])) {
    columns.push(['Building', ['under_construction']]);
  }
  if (hasAnyField(rows, ['power_throttled'])) {
    columns.push(['Power Throttled', ['power_throttled']]);
  }
  if (hasAnyField(rows, ['maintenance_display', 'maintenance_per_cycle'])) {
    columns.push(['Upkeep', ['maintenance_display', 'maintenance_per_cycle']]);
  }
  if (hasAnyField(rows, ['labor_cycle_display', 'labor_per_cycle'])) {
    columns.push(['Labor/cycle', ['labor_cycle_display', 'labor_per_cycle']]);
  }
  if (hasAnyField(rows, ['dining_points'])) {
    columns.push(['Dining', ['dining_points']]);
  }
  if (hasAnyField(rows, ['leisure_points'])) {
    columns.push(['Leisure', ['leisure_points']]);
  }
  if (hasAnyField(rows, ['tourism_upkeep'])) {
    columns.push(['Tourism Upkeep', ['tourism_upkeep']]);
  }
  if (hasAnyField(rows, ['output_price_per_unit_display', 'output_price_per_unit'])) {
    columns.push(['Price/unit', ['output_price_per_unit_display', 'output_price_per_unit']]);
  }
  if (hasAnyField(rows, ['is_recycler'])) columns.push(['Recycler', ['is_recycler']]);
  if (hasAnyField(rows, ['configured_recipe_id', 'recipe_id'])) {
    columns.push(['Recipe', ['configured_recipe_id', 'recipe_id']]);
  }
  // idle_reason is not on FacilityResponse list items; still show if live sends it.
  if (hasAnyField(rows, ['idle_reason'])) columns.push(['Idle Reason', ['idle_reason']]);
  if (hasAnyField(rows, ['rental_fee_per_run', 'output_price', 'price'])) {
    columns.push(['Rent/run', ['rental_fee_per_run', 'output_price', 'price']]);
  }
  if (hasAnyField(rows, ['public'])) columns.push(['Public', ['public']]);
  if (hasAnyField(rows, ['rent_per_cycle'])) {
    columns.push(['Rent/cycle', ['rent_per_cycle']]);
  }
  columns.push(['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']]);
  return columns;
}

function emitBattleCombatState(value: unknown): void {
  if (!isRecord(value)) return;
  const canEscape = formatYesNo(value.can_escape);
  const fleeCounter = formatNumber(value.flee_counter);
  const fleeRequired = formatNumber(value.flee_required);
  const effectiveSpeed = formatNumber(value.effective_speed);
  const weaponReach = formatZoneCount(value.max_weapon_reach);
  const warpDisrupted = formatYesNo(value.warp_disrupted);
  const webbed = formatYesNo(value.webbed);
  const emDisrupted = formatYesNo(value.em_disrupted);
  if (
    canEscape === undefined &&
    fleeCounter === undefined &&
    effectiveSpeed === undefined &&
    weaponReach === undefined &&
    warpDisrupted === undefined &&
    webbed === undefined &&
    emDisrupted === undefined
  ) {
    return;
  }

  emitLine(`\n${c.bright}Combat State:${c.reset}`);
  if (canEscape !== undefined) emitLine(`Can Escape: ${canEscape}`);
  if (fleeCounter !== undefined || fleeRequired !== undefined) {
    emitLine(`Flee Progress: ${fleeCounter ?? '?'}${fleeRequired === undefined ? '' : `/${fleeRequired}`}`);
  }
  if (effectiveSpeed !== undefined) emitLine(`Effective Speed: ${effectiveSpeed}`);
  if (weaponReach !== undefined) emitLine(`Weapon Reach: ${weaponReach}`);
  if (warpDisrupted !== undefined) emitLine(`Warp Disrupted: ${warpDisrupted}`);
  if (webbed !== undefined) emitLine(`Webbed: ${webbed}`);
  if (emDisrupted !== undefined) {
    const details = [
      formatPercentValue(value.speed_penalty_pct),
      value.disruption_ticks === undefined
        ? undefined
        : `${formatNumber(value.disruption_ticks) ?? value.disruption_ticks} ticks`,
    ].filter(Boolean);
    emitLine(`EM Disrupted: ${emDisrupted}${details.length ? ` (${details.join(', ')})` : ''}`);
  }
}

function battleParticipantRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    ...row,
    ship_display:
      row.ship_name && row.ship_class ? `${row.ship_name} (${row.ship_class})` : (row.ship_name ?? row.ship_class),
    hull_display: formatPercentValue(row.hull_pct),
    shield_display: formatPercentValue(row.shield_pct),
  }));
}

function battleParticipantColumns(rows: Array<Record<string, unknown>>): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [
    ['Name', ['username', 'name', 'player_name']],
    ['ID', ['player_id', 'id']],
    ['Side', ['side_id', 'side']],
  ];
  if (hasAnyField(rows, ['kind'])) {
    columns.push(['Kind', ['kind']]);
  }
  if (hasAnyField(rows, ['ship_display', 'ship_name', 'ship_class'])) {
    columns.push(['Ship', ['ship_display', 'ship_name', 'ship_class']]);
  }
  if (hasAnyField(rows, ['faction_tag', 'faction_name', 'faction_id'])) {
    columns.push(['Faction', ['faction_tag', 'faction_name', 'faction_id']]);
  }
  if (hasAnyField(rows, ['zone'])) columns.push(['Zone', ['zone']]);
  if (hasAnyField(rows, ['zone_distance'])) columns.push(['Distance', ['zone_distance']]);
  if (hasAnyField(rows, ['stance'])) columns.push(['Stance', ['stance']]);
  if (hasAnyField(rows, ['target_name', 'target_id'])) columns.push(['Target', ['target_name', 'target_id']]);
  if (hasAnyField(rows, ['hull_display', 'hull_pct'])) columns.push(['Hull', ['hull_display', 'hull_pct']]);
  if (hasAnyField(rows, ['shield_display', 'shield_pct'])) columns.push(['Shield', ['shield_display', 'shield_pct']]);
  return columns;
}

function rentSummaryValue(result: Record<string, unknown>, key: string): unknown {
  if (result[key] !== undefined) return result[key];
  const factionRent = isRecord(result.faction_rent) ? result.faction_rent : undefined;
  if (factionRent?.[key] !== undefined) return factionRent[key];
  const rent = isRecord(result.rent) ? result.rent : undefined;
  return rent?.[key];
}

function emitFactionRentSummary(result: Record<string, unknown>): void {
  const totalRent = formatCredits(rentSummaryValue(result, 'total_rent_per_cycle'));
  const arrears = formatCredits(rentSummaryValue(result, 'arrears_owed'));
  const grace = formatCycles(rentSummaryValue(result, 'grace_cycles'));
  const estRentPerDay = formatCredits(rentSummaryValue(result, 'est_rent_per_day'));
  const factionRent = isRecord(result.faction_rent) ? result.faction_rent : undefined;
  const note = factionRent?.note ?? result.note;
  const hint = factionRent?.hint ?? result.hint;

  if (totalRent !== undefined) emitLine(`\nFaction rent bill: ${totalRent}/cycle`);
  if (arrears !== undefined) emitLine(`Faction arrears: ${arrears}`);
  if (grace !== undefined) emitLine(`Grace remaining: ${grace}`);
  if (estRentPerDay !== undefined) emitLine(`Estimated rent/day: ${estRentPerDay}`);
  if (note) emitLine(String(note));
  if (hint) emitLine(String(hint));
}

function formatChatSender(message: Record<string, unknown>): string | undefined {
  const sender = message.sender ?? message.username ?? message.sender_name ?? message.sender_id;
  const verified = message.empire_official === true ? ' [empire_official]' : '';
  if (sender === undefined || sender === null || sender === '') return verified.trim() || undefined;
  return `${sender}${verified}`;
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
        timestamp_preview: formatTimestampPreview(
          message.timestamp_utc ?? message.timestamp ?? message.created_at ?? message.sent_at,
        ),
        sender_display: formatChatSender(message),
      }));
      if (r.channel) emitLine(`${c.dim}channel ${r.channel}${c.reset}`);
      printCompactTable(
        'Messages',
        rows,
        [
          ['Timestamp', ['timestamp_preview', 'timestamp', 'created_at', 'sent_at']],
          ['Sender', ['sender_display', 'sender', 'username', 'sender_name']],
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

  formatter(
    (r) => {
      if (r.entry === undefined && r.content === undefined && r.text === undefined) return false;
      emitLine(`\n${c.bright}=== Captain's Log Entry ===${c.reset}`);
      emitOptionalLine('Index', r.index);
      emitOptionalLine('Created', formatTimestampPreview(r.created_at ?? r.timestamp ?? r.date));
      emitBody('Entry', r.entry ?? r.content ?? r.text);
      return true;
    },
    { commands: ['captains_log_get'] },
  ),

  formatter(
    (r) => {
      if (!r.note_id && !r.title && r.content === undefined) return false;
      emitLine(`\n${c.bright}=== Note: ${r.title ?? r.note_id ?? 'Untitled'} ===${c.reset}`);
      emitOptionalLine('ID', r.note_id ?? r.id);
      emitOptionalLine('Author', r.created_by ?? r.author);
      emitOptionalLine('Created', formatTimestampPreview(r.created_at));
      emitOptionalLine('Updated', formatTimestampPreview(r.updated_at));
      emitOptionalLine('Value', r.value);
      emitBody('Content', r.content ?? r.text);
      return true;
    },
    { commands: ['read_note'] },
  ),

  formatter(
    (r) => {
      if (!r.room_id && !r.name && !r.description) return false;
      emitLine(`\n${c.bright}=== Faction Room: ${r.name ?? r.room_id ?? 'Room'} ===${c.reset}`);
      emitOptionalLine('ID', r.room_id ?? r.id);
      emitOptionalLine('Access', r.access);
      emitOptionalLine('Author', r.author);
      emitOptionalLine('Created', formatTimestampPreview(r.created_at));
      emitOptionalLine('Updated', formatTimestampPreview(r.updated_at));
      emitBody('Description', r.description);
      return true;
    },
    { commands: ['faction_visit_room'] },
  ),

  formatter(
    (r) => {
      const thread = isRecord(r.thread) ? r.thread : undefined;
      if (!thread) return false;
      emitLine(`\n${c.bright}=== Forum Thread: ${thread.title ?? thread.id ?? thread.thread_id} ===${c.reset}`);
      emitOptionalLine('ID', thread.id ?? thread.thread_id);
      emitOptionalLine('Category', thread.category);
      emitOptionalLine('Author', thread.author ?? thread.username ?? thread.author_id);
      emitOptionalLine('Created', formatTimestampPreview(thread.created_at));
      emitOptionalLine('Updated', formatTimestampPreview(thread.updated_at));
      emitOptionalLine('Upvotes', thread.upvotes);
      emitOptionalLine('Replies', r.total_replies ?? thread.reply_count);
      emitBody('Content', thread.content ?? thread.text);
      const replies = firstArray(r, ['replies']);
      if (replies) {
        const rows = replies.map((reply) => ({
          ...reply,
          created_preview: formatTimestampPreview(reply.created_at ?? reply.timestamp),
          content_preview: firstLinePreview(reply.content ?? reply.text),
        }));
        printCompactTable(
          'Replies',
          rows,
          [
            ['Author', ['author', 'username', 'author_id']],
            ['Created', ['created_preview', 'created_at', 'timestamp']],
            ['Reply', ['content_preview', 'content', 'text']],
            ['Votes', ['upvotes']],
            ['ID', ['id', 'reply_id']],
          ],
          { maxCellWidth: 72 },
        );
      }
      const replyMetadata = [
        r.page === undefined ? undefined : `reply page ${r.page}`,
        r.per_page === undefined ? undefined : `per page ${r.per_page}`,
        r.total_replies === undefined ? undefined : `total replies ${r.total_replies}`,
      ].filter(Boolean);
      if (replyMetadata.length) emitLine(`${c.dim}${replyMetadata.join(' | ')}${c.reset}`);
      if (r.has_more) emitLine(`${c.dim}More replies available.${c.reset}`);
      return true;
    },
    { commands: ['forum_get_thread'] },
  ),

  formatter(
    (r) => {
      if (r.content === undefined && !Array.isArray(r.guides)) return false;
      if (Array.isArray(r.guides)) {
        printCompactTable('Guides', r.guides.filter(isRecord), [
          ['Guide', ['guide', 'id', 'name']],
          ['Title', ['title']],
          ['Summary', ['summary', 'description']],
        ]);
      }
      if (r.content !== undefined) {
        emitLine(`\n${c.bright}=== Guide: ${r.guide ?? 'Guide'} ===${c.reset}`);
        emitOptionalLine('Server version', r.server_version);
        emitBody('Content', r.content);
      }
      if (r.content === undefined) emitOptionalLine('Server version', r.server_version);
      if (r.hint) emitLine(`\n${c.dim}${r.hint}${c.reset}`);
      return true;
    },
    { commands: ['get_guide'] },
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
      const columns: Array<[string, string[]]> = [
        ['Timestamp', ['timestamp_preview', 'created_at', 'timestamp']],
        ['Summary', ['summary', 'message', 'description']],
        ['Category', ['category']],
      ];
      if (hasAnyField(rows, ['event_type', 'type'])) columns.push(['Event', ['event_type', 'type']]);
      if (hasAnyField(rows, ['job_id'])) columns.push(['Job', ['job_id']]);
      if (hasAnyField(rows, ['mode'])) columns.push(['Mode', ['mode']]);
      if (hasAnyField(rows, ['runs'])) columns.push(['Runs', ['runs']]);
      if (hasAnyField(rows, ['venue'])) columns.push(['Venue', ['venue']]);
      if (hasAnyField(rows, ['storage'])) columns.push(['Storage', ['storage']]);
      emitLine(`${c.dim}category ${category}${c.reset}`);
      printCompactTable('Entries', rows, columns, { maxCellWidth: 80 });
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
      if (r.owned_bases !== undefined) emitLine(`Owned Stations: ${r.owned_bases}`);
      if (r.treasury !== undefined) emitLine(`Treasury: ${r.treasury}`);
      if (typeof r.description === 'string' && r.description) emitLine(`Description: ${r.description}`);
      if (typeof r.charter === 'string' && r.charter) emitLine(`Charter: ${r.charter}`);

      const facilities = firstArray(r, ['facilities']);
      if (facilities) {
        printCompactTable('Faction Facilities', facilities, [
          ['Name', ['name', 'type_name', 'facility_type', 'type']],
          ['ID', ['facility_id', 'id']],
          ['Station', ['base_id', 'base_name']],
          ['Service', ['faction_service']],
          ['Active', ['active', 'enabled', 'status']],
        ]);
      }
      return true;
    },
    { commands: ['faction_info'] },
  ),

  // Public faction profile (GET /api/factions/{tag})
  formatter(
    (r, command) => {
      if (!commandNameEquals(command, 'faction_profile')) return false;
      if (typeof r.name !== 'string' || typeof r.tag !== 'string') return false;

      const title = `${r.name} [${r.tag}]`;
      emitLine(`\n${c.bright}=== Public Faction Profile ===${c.reset}`);
      emitLine(`Name: ${c.bright}${title}${c.reset}`);
      if (r.id !== undefined) emitLine(`ID: ${r.id}`);
      if (r.leader !== undefined) emitLine(`Leader: ${r.leader}`);
      if (r.founder !== undefined) emitLine(`Founder: ${r.founder}`);
      if (r.member_count !== undefined) emitLine(`Members: ${formatNumber(r.member_count) ?? r.member_count}`);
      if (r.treasury !== undefined) emitLine(`Treasury: ${formatNumber(r.treasury) ?? r.treasury}`);
      if (r.primary_color !== undefined || r.secondary_color !== undefined) {
        emitLine(`Colors: ${r.primary_color ?? '—'} / ${r.secondary_color ?? '—'}`);
      }
      if (r.created_at !== undefined) emitLine(`Created: ${formatTimestampPreview(r.created_at) || r.created_at}`);
      if (typeof r.description === 'string' && r.description) emitLine(`Description: ${r.description}`);
      if (typeof r.charter === 'string' && r.charter) emitBody('Charter', r.charter);

      const members = firstArray(r, ['members']);
      if (members) {
        const rows = members.map((member) => ({
          ...member,
          joined_preview: formatTimestampPreview(member.joined_at),
        }));
        printCompactTable('Members', rows, [
          ['Username', ['username', 'name']],
          ['Role', ['role']],
          ['Joined', ['joined_preview', 'joined_at']],
        ]);
      }

      for (const [titleLabel, key] of [
        ['Allies', 'allies'],
        ['Enemies', 'enemies'],
        ['Wars', 'wars'],
      ] as const) {
        const list = firstArray(r, [key]);
        if (!list?.length) continue;
        printCompactTable(titleLabel, list, [
          ['Name', ['name', 'faction_name', 'tag']],
          ['Tag', ['tag']],
          ['ID', ['id', 'faction_id']],
        ]);
      }

      const stations = firstArray(r, ['stations']);
      if (stations?.length) {
        printCompactTable('Stations', stations, [
          ['Name', ['name', 'station_name']],
          ['ID', ['id', 'station_id', 'base_id']],
          ['System', ['system_name', 'system_id']],
        ]);
      }

      if (Array.isArray(r.titles) && r.titles.length) {
        emitLine(`\n${c.bright}Titles:${c.reset} ${r.titles.map(String).join(', ')}`);
      }
      if (Array.isArray(r.emblems) && r.emblems.length) {
        emitLine(`${c.bright}Emblems:${c.reset} ${r.emblems.map(String).join(', ')}`);
      }

      const ranks = Array.isArray(r.ranks) ? r.ranks.filter(isRecord) : [];
      if (ranks.length) {
        const rankRows = ranks.map((row) => ({
          ...row,
          value_display: typeof row.value === 'number' ? (formatNumber(row.value) ?? row.value) : row.value,
        }));
        printCompactTable('Leaderboard Ranks', rankRows, [
          ['Category', ['label', 'category']],
          ['Rank', ['rank']],
          ['Value', ['value_display', 'value']],
        ]);
      }

      if (isRecord(r.achievements)) {
        const a = r.achievements;
        emitLine(`\n${c.bright}Achievements:${c.reset}`);
        if (a.earned !== undefined || a.total !== undefined) {
          emitLine(`  Earned: ${a.earned ?? '?'}${a.total !== undefined ? ` / ${a.total}` : ''}`);
        }
        if (a.points !== undefined) emitLine(`  Points: ${formatNumber(a.points) ?? a.points}`);
      }

      return true;
    },
    { commands: ['faction_profile'] },
  ),

  formatter(
    (r) => {
      const invites = firstArray(r, ['invites']);
      if (!invites) return false;
      const rows = invites.map((invite) => ({
        ...invite,
        created_preview: formatTimestampPreview(invite.created_at ?? invite.invited_at ?? invite.timestamp),
      }));
      printCompactTable('Faction Invites', rows, [
        ['Faction', ['faction_name', 'name']],
        ['Tag', ['tag', 'faction_tag']],
        ['ID', ['faction_id', 'id']],
        ['Invited By', ['invited_by', 'sender', 'username']],
        ['Created', ['created_preview', 'created_at', 'invited_at', 'timestamp']],
      ]);
      return true;
    },
    { commands: ['faction_get_invites'] },
  ),

  formatter(
    (r, command) => {
      if (
        !commandNameEquals(command, 'faction_intel_status') &&
        !commandNameEquals(command, 'faction_trade_intel_status')
      ) {
        return false;
      }
      if (r.intel_level === undefined && r.coverage_pct === undefined) return false;
      const title = commandNameEquals(command, 'faction_trade_intel_status')
        ? 'Faction Trade Intel'
        : 'Faction Intel';
      emitLine(`\n${c.bright}=== ${title} Status ===${c.reset}`);
      emitOptionalLine('Intel Level', r.intel_level);
      emitOptionalLine('Coverage', r.coverage_pct === undefined ? undefined : `${r.coverage_pct}%`);
      emitOptionalLine('Systems Known', r.systems_known);
      emitOptionalLine('POIs Known', r.pois_known);
      emitOptionalLine('Stations Known', r.stations_known);
      emitOptionalLine('Items Tracked', r.items_tracked);
      emitOptionalLine('Total Systems', r.total_systems);
      emitOptionalLine('Total Stations', r.total_stations);
      emitOptionalLine('Contributors', r.contributors);
      emitOptionalLine('Top Contributor', r.top_contributor);
      if (!Array.isArray(r.top_contributions)) emitOptionalLine('Top Contributions', r.top_contributions);
      emitOptionalLine('Most Recent Tick', r.most_recent_tick);
      const contributions = firstArray(r, ['top_contributions']);
      if (contributions) {
        printCompactTable('Top Contributions', contributions, [
          ['Contributor', ['contributor', 'username', 'player_id']],
          ['Count', ['count', 'contributions']],
        ]);
      }
      return true;
    },
    { commands: ['faction_intel_status', 'faction_trade_intel_status'] },
  ),

  namedFormatter(
    'faction_facility_owned',
    ['facilities'],
    (r) => {
      if (r.action !== 'faction_owned') return false;
      const facilities = firstArray(r, ['facilities']);
      if (!facilities) return false;

      const rows = facilities.map((facility) => ({
        ...facility,
        name_display: facilityDisplayName(facility),
        rent_display: formatCredits(facility.rent_per_cycle),
        arrears_display: formatCredits(facility.arrears_owed),
        labor_display: formatCredits(facility.labor_per_run),
      }));
      const columns: Array<[string, string[]]> = [
        ['Name', ['name_display', 'name', 'type']],
        ['ID', ['facility_id', 'id']],
        ['Station', ['base_name', 'base_id']],
        ['System', ['system_id']],
        ['Rent', ['rent_display', 'rent_per_cycle']],
        ['Missed', ['missed_rent_cycles']],
        ['Arrears', ['arrears_display', 'arrears_owed']],
        ['Labor/run', ['labor_display', 'labor_per_run']],
      ];
      // Schema FacilityResponse.2 facilities do not declare active/idle_reason;
      // still render them when a live payload includes them.
      if (hasAnyField(rows, ['active', 'status'])) {
        columns.splice(4, 0, ['Active', ['active', 'status']]);
      }
      if (hasAnyField(rows, ['idle_reason'])) {
        columns.push(['Idle', ['idle_reason']]);
      }
      printCompactTable('Faction Facilities', rows, columns);

      emitFactionRentSummary(r);
      return true;
    },
    { commands: ['faction_facility_owned'], shapeFallback: true },
  ),

  // Facilities
  namedFormatter(
    'facilities',
    ['facilities'],
    (r) => {
      const facilities = firstArray(r, ['facilities', 'facility_types', 'upgrades']);
      if (!facilities) return false;
      const rows = facilityRows(facilities);
      printCompactTable('Facilities', rows, facilityColumns(rows));
      return true;
    },
    { commands: ['facility_list'], shapeFallback: true },
  ),

  // Facility List
  namedFormatter(
    'facility_list',
    ['station_facilities', 'player_facilities', 'faction_facilities', 'public_facilities'],
    (r) => {
      const groups: Array<[string, Array<Record<string, unknown>> | undefined]> = [
        ['Station Facilities', firstArray(r, ['station_facilities'])],
        ['Public Facilities', firstArray(r, ['public_facilities'])],
        ['Player Facilities', firstArray(r, ['player_facilities'])],
        ['Faction Facilities', firstArray(r, ['faction_facilities'])],
      ];
      if (!groups.some(([, rows]) => Array.isArray(rows) && rows.length > 0)) return false;

      if (r.base_id) emitLine(`\n${c.bright}=== Facilities at ${r.base_id} ===${c.reset}`);
      emitStationPower(r.power);
      emitStationLifeSupport(r.life_support);
      emitStationConstruction(r.construction);
      for (const [title, rows] of groups) {
        if (!rows?.length) continue;
        const displayRows = facilityRows(rows);
        printCompactTable(title, displayRows, facilityColumns(displayRows, { grouped: true }));
      }
      emitFactionRentSummary(r);
      return true;
    },
    { commands: ['facility_list'], shapeFallback: true },
  ),

  // Facility Upgrades (for facility_upgrades and faction variants)
  namedFormatter(
    'facility_upgrades',
    ['upgrades'],
    (r) => {
      const ups = firstArray(r, ['upgrades', 'faction_upgrades', 'locked_upgrades']);
      if (!ups || !Array.isArray(ups) || !ups.length) return false;
      const rows = ups.map((u: Record<string, unknown>) => {
        const to = isRecord(u.upgrade_to) ? u.upgrade_to : {};
        return {
          ...u,
          current: u.current_level,
          target_name: to.name ?? to.type_id ?? to.level,
          target_level: to.level,
          cost: to.build_cost,
          time: to.build_time,
          labor: to.labor_cost,
        };
      });
      printCompactTable('Available Upgrades', rows, [
        ['Current', ['current_level', 'current']],
        ['To', ['target_name', 'upgrade_to.name', 'name']],
        ['Cost', ['cost', 'build_cost']],
        ['Ticks', ['time', 'build_time']],
        ['Labor', ['labor', 'labor_cost']],
        ['Requires', ['requires']],
      ]);
      const hint = r.hint ?? r.faction_upgrade_hint;
      if (hint) emitLine(`\n${hint}`);
      return true;
    },
    { commands: ['facility_upgrades'], shapeFallback: true },
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

  // Fleet Status
  namedFormatter(
    'fleet',
    ['fleet'],
    (r, command) => {
      // Shape fallback must require fleet-specific signals. A bare `members`
      // array is shared by public faction profiles (`faction profile`).
      const isFleetCommand = commandNameEquals(command, 'fleet_status');
      const fleet = isRecord(r.fleet)
        ? r.fleet
        : r.in_fleet !== undefined || r.fleet_id || (isFleetCommand && Array.isArray(r.members))
          ? r
          : undefined;
      if (!fleet) return false;
      emitLine(`\n${c.bright}=== Fleet ===${c.reset}`);
      emitLine(`ID: ${fleet.fleet_id || fleet.id || 'unknown'}`);
      if (fleet.leader || fleet.leader_name || fleet.leader_id) {
        emitLine(`Leader: ${fleet.leader || fleet.leader_name || fleet.leader_id}`);
      }
      if (fleet.in_fleet === false) emitLine('In fleet: no');
      const members = (fleet.members || r.members) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(members)) {
        const rows = members.filter(isRecord).map((member) => {
          const ship = member.ship;
          const shipDisplay = isRecord(ship) ? ship.name || ship.class_name || ship.class_id || ship.id : ship;
          const locationDisplay =
            member.system_name ||
            member.system_id ||
            member.current_system ||
            member.poi_name ||
            member.poi_id ||
            fleet.system_id ||
            fleet.poi_id;
          return {
            ...member,
            ship_display: shipDisplay,
            location_display: locationDisplay,
          };
        });
        printCompactTable('Members', rows, [
          ['Name', ['username', 'name', 'player_name']],
          ['ID', ['player_id', 'id']],
          ['Ship', ['ship_display', 'ship_class', 'ship_name']],
          ['Location', ['location_display', 'system_name', 'current_system', 'poi_name', 'current_poi']],
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
    ['battle', 'battle_id', 'combat_state', 'participants'],
    (r, command) => {
      if (command?.replace(/^v2_/, '') !== 'get_battle_status') return false;
      const battle = isRecord(r.battle) ? r.battle : r;
      const participants = (battle.participants || r.participants) as Array<Record<string, unknown>> | undefined;
      if (!battle.battle_id && !battle.id && !battle.status && !battle.phase && !Array.isArray(participants)) {
        return false;
      }
      emitLine(`\n${c.bright}=== Battle ===${c.reset}`);
      emitLine(`ID: ${battle.battle_id || battle.id || 'unknown'}`);
      if (battle.system_id) emitLine(`System: ${battle.system_id}`);
      if (battle.is_participant !== undefined)
        emitLine(`Participant: ${formatYesNo(battle.is_participant) ?? battle.is_participant}`);
      if (battle.status || battle.phase) emitLine(`Status: ${battle.status || battle.phase}`);
      if (battle.range_band || battle.range) emitLine(`Range: ${battle.range_band || battle.range}`);
      if (battle.tick_duration !== undefined) emitLine(`Tick Duration: ${battle.tick_duration}`);
      emitBattleCombatState(battle.combat_state);
      const sides = (battle.sides || r.sides) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(sides)) {
        printCompactTable('Sides', sides.filter(isRecord), [
          ['Side', ['side_id']],
          ['Faction', ['faction_tag', 'faction_name', 'faction_id']],
          ['Players', ['player_count']],
        ]);
      }
      if (Array.isArray(participants)) {
        const rows = battleParticipantRows(participants);
        printCompactTable('Participants', rows, battleParticipantColumns(rows));
      }
      return true;
    },
    { commands: ['get_battle_status'] },
  ),

  // Battle summary (any battle by ID)
  formatter(
    (r) => {
      if (r.battle_id === undefined && r.outcome === undefined && r.total_damage === undefined) return false;
      if (!Array.isArray(r.sides) && r.participant_count === undefined && !Array.isArray(r.player_names)) {
        return false;
      }

      emitLine(`\n${c.bright}=== Battle Summary ===${c.reset}`);
      emitOptionalLine('ID', r.battle_id);
      if (r.system_name || r.system_id) {
        const system = r.system_name
          ? r.system_id
            ? `${r.system_name} (${r.system_id})`
            : r.system_name
          : r.system_id;
        emitOptionalLine('System', system);
      }
      emitOptionalLine('Status', r.status);
      emitOptionalLine('Category', r.category);
      emitOptionalLine('Outcome', r.outcome);
      emitOptionalLine('Winning Side', r.winning_side);
      emitOptionalLine('Start Tick', r.start_tick);
      emitOptionalLine('Duration', r.duration_ticks === undefined ? undefined : `${r.duration_ticks} ticks`);
      emitOptionalLine('Participants', r.participant_count);
      emitOptionalLine('Total Damage', r.total_damage);
      emitOptionalLine('Ships Destroyed', r.ships_destroyed);
      if (Array.isArray(r.player_names) && r.player_names.length) {
        emitLine(`Players: ${r.player_names.join(', ')}`);
      }
      if (Array.isArray(r.destroyed_names) && r.destroyed_names.length) {
        emitLine(`Destroyed: ${r.destroyed_names.join(', ')}`);
      }
      if (isRecord(r.top_damage)) {
        emitLine(`Top Damage: ${r.top_damage.username ?? '?'} (${r.top_damage.damage ?? '?'})`);
      }
      const sides = firstArray(r, ['sides']);
      if (sides) {
        const rows = sides.map((side) => ({
          ...side,
          participants_display: Array.isArray(side.participants) ? side.participants.join(', ') : side.participants,
        }));
        printCompactTable('Sides', rows, [
          ['Side', ['side_id']],
          ['Faction', ['faction_tag', 'faction_id']],
          ['Participants', ['participants_display', 'participants']],
        ]);
      }
      return true;
    },
    { commands: ['get_battle_summary'] },
  ),

  // Battle log (tick-by-tick compact replay)
  formatter(
    (r) => {
      const entries = firstArray(r, ['entries']);
      if (!entries && r.total_ticks === undefined && r.has_more === undefined) return false;
      if (r.battle_id === undefined && !entries) return false;

      emitLine(`\n${c.bright}=== Battle Log ===${c.reset}`);
      emitOptionalLine('ID', r.battle_id);
      emitOptionalLine('Status', r.status);
      emitOptionalLine('Total Ticks', r.total_ticks);
      if (r.has_more !== undefined) emitLine(`Has More: ${formatYesNo(r.has_more) ?? r.has_more}`);

      if (entries) {
        const rows = entries.map((entry, index) => {
          const attacks = Array.isArray(entry.attacks) ? entry.attacks.filter(isRecord) : [];
          const totalDamage = attacks.reduce((sum, attack) => {
            const dmg = typeof attack.final_damage === 'number' ? attack.final_damage : 0;
            return sum + dmg;
          }, 0);
          const hits = attacks.filter((attack) => attack.hit_success === true).length;
          const burns = Array.isArray(entry.burns) ? entry.burns.length : 0;
          const flees = Array.isArray(entry.flee) ? entry.flee.length : 0;
          const kills = Array.isArray(entry.kills) ? entry.kills.length : 0;
          const ended = isRecord(entry.battle_ended);
          return {
            tick: entry.tick ?? entry.battle_tick ?? index,
            attacks: attacks.length,
            hits,
            damage: totalDamage || undefined,
            burns: burns || undefined,
            flee: flees || undefined,
            kills: kills || undefined,
            ended: ended ? 'yes' : undefined,
          };
        });
        printCompactTable('Ticks', rows, [
          ['Tick', ['tick']],
          ['Attacks', ['attacks']],
          ['Hits', ['hits']],
          ['Damage', ['damage']],
          ['Burns', ['burns']],
          ['Flee', ['flee']],
          ['Kills', ['kills']],
          ['Ended', ['ended']],
        ]);
      }
      return true;
    },
    { commands: ['get_battle_log'] },
  ),
];
