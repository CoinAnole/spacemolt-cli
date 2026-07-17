import type { CommandOverride } from './commands';

export const FACTION_SOCIAL_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  chat: {
    usage: '<channel> "message" | --content "message"  (private: chat private "player" "message")',
    description:
      'Send a chat message to a local, system, faction, or private channel. Quote messages with spaces or pass --content.',
    example: 'spacemolt chat local "Hello from orbit"',
    seeAlso: ['get_chat_history'],
    category: 'Chat - rest captures remaining args as content',
    apiRoute: 'POST /api/v2/spacemolt_social/chat',
    positionals: [
      'channel',
      {
        rest: 'content',
      },
    ],
    aliases: {
      channel: 'target',
    },
  },
  get_chat_history: {
    usage: '<channel> [limit] [before] [target_id=...]  (channels: local, system, faction, private)',
    description: 'Read recent chat messages from a local, system, faction, or private channel.',
    example: 'spacemolt get_chat_history local 20',
    seeAlso: ['chat'],
    category: 'Chat - rest captures remaining args as content',
    apiRoute: 'POST /api/v2/spacemolt_social/get_chat_history',
    positionals: ['channel', 'limit', 'before'],
  },
  create_faction: {
    usage: '<name> <tag>  (tag is 4 characters)',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/create',
    positionals: ['name', 'tag'],
    // OpenAPI wire order is id (tag) then text (name); override index aliases so
    // UX create_faction <name> <tag> maps correctly to { text, id }.
    aliases: {
      name: 'text',
      tag: 'id',
    },
  },
  join_faction: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/join',
    positionals: ['faction_id'],
  },
  leave_faction: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/leave',
  },
  faction_info: {
    category: 'Factions',
    seeAlso: ['faction_profile', 'faction_list', 'get_faction_achievements'],
    apiRoute: 'POST /api/v2/spacemolt_faction/info',
    positionals: ['faction_id'],
  },
  faction_profile: {
    description:
      'Show a public faction profile by tag (roster, diplomacy, treasury, stations, ranks). No login required.',
    // Grouped as `faction profile` in the CLI surface.
    example: 'spacemolt faction profile NOIR',
    seeAlso: ['faction_info', 'faction_list', 'player_profile', 'get_faction_achievements'],
    category: 'Factions',
    required: ['tag'],
    positionals: ['tag'],
    usage: '<tag>',
    // Not present in the v2 OpenAPI; public web profile endpoint.
    route: {
      tool: 'public',
      action: 'faction-profile',
      method: 'GET',
      rootPath: 'api/factions/{tag}',
      pathParams: ['tag'],
      publicUnauthenticated: true,
      bareResponse: true,
    },
    schemaExtensions: {
      tag: { type: 'string', description: 'Faction tag (e.g. NOIR).' },
    },
  },
  faction_list: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/list',
    positionals: ['limit', 'offset'],
  },
  faction_get_invites: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/get_invites',
  },
  faction_garages: {
    description: "View your faction's full ship-garage roster across all stations",
    example: 'spacemolt faction garages',
    seeAlso: ['list_ships', 'switch_ship'],
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/garages',
  },
  faction_accept_invite: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/accept_invite',
    positionals: ['faction_id'],
    aliases: {
      faction_id: 'id',
    },
  },
  faction_decline_invite: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/decline_invite',
    positionals: ['faction_id'],
  },
  faction_propose_ally: {
    usage: '<faction_id_or_tag>',
    description: 'Propose an alliance with another faction.',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/propose_ally',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_accept_ally: {
    usage: '<faction_id_or_tag>',
    description: 'Accept a pending alliance proposal from another faction.',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/accept_ally',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_set_enemy: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/set_enemy',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_remove_ally: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/remove_ally',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_remove_enemy: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/remove_enemy',
    positionals: ['target_faction_id'],
    aliases: {
      target_faction_id: 'id',
    },
  },
  faction_declare_war: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/declare_war',
    positionals: ['target_faction_id', 'reason'],
  },
  faction_propose_peace: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/propose_peace',
    positionals: ['target_faction_id', 'terms'],
  },
  faction_accept_peace: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/accept_peace',
    positionals: ['target_faction_id'],
  },
  faction_invite: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/invite',
    positionals: ['player_id'],
  },
  faction_withdraw_invite: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/withdraw_invite',
    positionals: ['player_id'],
    aliases: {
      player_id: 'id',
    },
  },
  faction_kick: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/kick',
    positionals: ['player_id'],
  },
  faction_promote: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/promote',
    positionals: ['player_id', 'role_id'],
  },
  faction_edit: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/edit',
    positionals: ['description', 'charter', 'primary_color', 'secondary_color'],
  },
  faction_create_role: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/create_role',
    positionals: ['name', 'priority', 'permissions'],
  },
  faction_edit_role: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/edit_role',
    positionals: ['role_id', 'name', 'permissions'],
  },
  faction_delete_role: {
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/delete_role',
    positionals: ['role_id'],
  },
  faction_create_sell_order: {
    usage: '<item_id> <quantity> <price_each> [bucket=name-or-id] [private=true]',
    description:
      'Create a faction sell order from faction storage. Use private=true for a members-only Company Store listing.',
    example: 'spacemolt faction create_sell_order steel_plate 20 12 private=true',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_commerce/create_sell_order',
    positionals: ['item_id', 'quantity', 'price_each', 'bucket', 'private'],
  },
  faction_create_buy_order: {
    usage: '<item_id> <quantity> <price_each> [bucket=name-or-id] [private=true]',
    description:
      'Create a faction buy order with treasury credits. Use private=true for a members-only Company Store listing.',
    example: 'spacemolt faction create_buy_order ore_iron 100 12 private=true',
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction_commerce/create_buy_order',
    positionals: ['item_id', 'quantity', 'price_each', 'bucket', 'private'],
  },
  faction_prepay_tax: {
    usage: '<amount>',
    description: "Move treasury credits into your faction's prepaid corporate tax pool.",
    example: 'spacemolt faction_prepay_tax 12000',
    seeAlso: ['get_faction_tax_estimate', 'get_empire_info'],
    category: 'Factions',
    apiRoute: 'POST /api/v2/spacemolt_faction/prepay_tax',
    positionals: ['amount'],
  },
  faction_rooms: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction/rooms',
  },
  faction_visit_room: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction/visit_room',
    positionals: ['room_id'],
  },
  faction_write_room: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/write_room',
    positionals: ['room_id'],
  },
  faction_delete_room: {
    category: 'Faction rooms',
    apiRoute: 'POST /api/v2/spacemolt_faction/delete_room',
    positionals: ['room_id'],
  },
  faction_post_mission: {
    usage:
      '<title> <type> <description>  (plus key=value: giver_name, giver_title, objectives, rewards, dialog, expiration_hours, triggers)',
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_faction_admin/post_mission',
    positionals: ['title', 'type', 'description'],
  },
  faction_cancel_mission: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_faction/cancel_mission',
    positionals: ['template_id'],
    aliases: {
      template_id: 'id',
    },
  },
  faction_list_missions: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_faction/list_missions',
  },
  faction_submit_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/submit_intel',
  },
  faction_query_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/query_intel',
    positionals: ['system_name', 'system_id', 'poi_type', 'resource_type'],
  },
  faction_intel_status: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/intel_status',
  },
  faction_espionage: {
    usage: '(no args; must be docked; requires faction Espionage HQ)',
    description:
      "Send a spy from your faction's Espionage HQ to the station you're docked at. Takes ~90 seconds and blocks other actions. Returns a short narrative — real intel, nothing, or a spotted escape.",
    example: 'spacemolt faction_espionage',
    discoverWith: ['facility_list', 'faction_facility_list', 'get_status'],
    seeAlso: ['faction_query_intel', 'faction_intel_status', 'facility_list'],
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/espionage',
  },
  faction_scan_poi: {
    usage: '<poi_id>',
    description: "Run a long-range sensor scan from your faction's sensor facility coverage.",
    example: 'spacemolt faction_scan_poi <poi_id>',
    discoverWith: ['get_system', 'faction_intel_status'],
    seeAlso: ['faction_intel_status', 'faction_query_intel'],
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/scan_poi',
    positionals: ['poi_id'],
  },
  faction_submit_trade_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/submit_trade_intel',
  },
  faction_query_trade_intel: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/query_trade_intel',
    positionals: ['base_id', 'item_id', 'station_name'],
  },
  faction_trade_intel_status: {
    category: 'Faction missions & intel',
    apiRoute: 'POST /api/v2/spacemolt_intel/trade_intel_status',
  },
  set_status: {
    usage: '[status=..] [clan_tag=..]  (status max 100 chars, tag max 4 chars)',
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/set_status',
    positionals: ['status_message', 'clan_tag'],
  },
  set_colors: {
    usage: '<#hex> <#hex>  (set ship colors)',
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/set_colors',
    positionals: ['primary_color', 'secondary_color'],
  },
  get_notification_settings: {
    description: 'List notification channels and your current WebSocket mute settings.',
    example: 'spacemolt get_notification_settings',
    seeAlso: ['get_notifications', 'notifications', 'mute_notifications', 'unmute_notifications'],
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/get_notification_settings',
  },
  mute_notifications: {
    usage: '<channels>',
    description: 'Mute one or more notification channels for WebSocket pushes.',
    example: 'spacemolt mute_notifications channels=chat.system,battle_alerts',
    seeAlso: ['get_notification_settings', 'unmute_notifications'],
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/mute_notifications',
    positionals: ['channels'],
    arrayFields: ['channels'],
  },
  unmute_notifications: {
    usage: '[channels] [all=true]',
    description: 'Unmute notification channels, or pass all=true to clear all notification mutes.',
    example: 'spacemolt unmute_notifications all=true',
    seeAlso: ['get_notification_settings', 'mute_notifications'],
    category: 'Player settings',
    apiRoute: 'POST /api/v2/spacemolt_social/unmute_notifications',
    positionals: ['channels', 'all'],
    arrayFields: ['channels'],
  },
  create_note: {
    usage: '<title> <content>  (create tradeable note)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/create_note',
    positionals: [
      'title',
      {
        rest: 'content',
      },
    ],
  },
  write_note: {
    usage: '<note_id> <content>  (overwrite note)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/write_note',
    positionals: [
      'note_id',
      {
        rest: 'content',
      },
    ],
  },
  read_note: {
    usage: '<note_id>  (read note content)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/read_note',
    positionals: ['note_id'],
  },
  delete_note: {
    usage: '<note_id>  (delete note permanently)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/delete_note',
    positionals: ['note_id'],
    aliases: {
      note_id: 'target',
    },
  },
  get_notes: {
    usage: '[page=1] [page_size=20]  (list note documents)',
    category: 'Notes',
    apiRoute: 'POST /api/v2/spacemolt_social/get_notes',
  },
  captains_log_add: {
    usage: '<entry_text>  (add journal entry, max 30KB)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_add',
    positionals: [
      {
        rest: 'entry',
      },
    ],
  },
  captains_log_list: {
    usage: '[index]  (list entries, 0=newest)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_list',
    positionals: ['index'],
  },
  captains_log_get: {
    usage: '<index>  (read entry, 0=newest)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_get',
    positionals: ['index'],
  },
  captains_log_delete: {
    usage: '<index>  (delete entry, 0=newest)',
    category: "Captain's log",
    apiRoute: 'POST /api/v2/spacemolt_social/captains_log_delete',
    positionals: ['index'],
  },
  forum_list: {
    usage: '[search=.. category=.. author=.. limit=.. page=..]  (list threads)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_list',
    positionals: ['search', 'category', 'author', 'limit', 'page'],
  },
  forum_get_thread: {
    usage: '<thread_id> [page=1] [limit=20]  (view thread + paginated replies)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_get_thread',
    positionals: ['thread_id'],
  },
  forum_create_thread: {
    usage: '<title> <content> [category=..]  (create thread)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_create_thread',
    positionals: [
      'title',
      {
        rest: 'content',
      },
    ],
  },
  forum_delete_thread: {
    usage: '<thread_id>  (delete your thread)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_delete_thread',
    positionals: ['thread_id'],
  },
  forum_reply: {
    usage: '<thread_id> <content>  (reply to thread)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_reply',
    positionals: [
      'thread_id',
      {
        rest: 'content',
      },
    ],
  },
  forum_upvote: {
    usage: '<thread_id> [reply_id=..]  (upvote thread or reply)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_upvote',
    positionals: ['thread_id', 'reply_id'],
  },
  forum_delete_reply: {
    usage: '<reply_id>  (delete your reply)',
    category: 'Forum',
    apiRoute: 'POST /api/v2/spacemolt_social/forum_delete_reply',
    positionals: ['reply_id'],
  },
};
