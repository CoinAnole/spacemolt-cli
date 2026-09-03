import type { CommandOverride } from './commands';

export const BATTLE_SHIPYARD_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  battle_engage: {
    usage: '[side_id]  (optional numeric side; omit for faction-based auto-assignment)',
    description:
      'Join an existing battle. This command cannot start a battle; omit side_id for faction-based auto-assignment. Does not cost a tick — only reload does.',
    example: 'spacemolt battle_engage 1',
    discoverWith: ['get_battle_status'],
    seeAlso: ['attack', 'get_battle_status', 'battle_target', 'battle_stance'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/engage',
    positionals: ['side_id'],
  },
  battle_advance: {
    description: 'Advance toward the inner battle zone. Does not cost a tick — only reload does.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/advance',
  },
  battle_retreat: {
    description: 'Retreat toward the outer battle zone. Does not cost a tick — only reload does.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/retreat',
  },
  battle_stance: {
    usage: '<stance> [target] [marines=N]',
    description:
      "Set your battle stance (fire, evade, brace, flee, or board). For board, the server requires target and marines=N (fit marines committed; the battle tick caps to marines actually available); other stances still take only <stance>. The CLI rejects marines below 1. A faster effective speed lets the boarder intercept the target's retreat and flee; an equal or faster target can kite. Changing away from board begins a non-instant withdrawal. Does not cost a tick — only reload does.",
    example: 'spacemolt battle_stance board pirate-1 marines=8',
    discoverWith: ['get_battle_status'],
    seeAlso: ['get_battle_status', 'battle_target'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/stance',
    positionals: ['stance', 'target'],
    aliases: {
      stance: 'id',
      target_id: 'target',
    },
    schemaExtensions: {
      // Keep this description. Dropping it restores generated `target_id` wording, which help forbids.
      id: {
        description:
          "Battle stance: fire (100% dmg dealt/taken), evade (0%/50%, costs fuel), brace (0%/25%, shields regen 2x), flee (0%/100%, auto-retreats to escape), or board (0%/100%, automatically closes for repeated latch attempts; the server requires target and marines). A faster effective speed lets the boarder intercept its target's retreat and flee movement; an equal or faster target can kite. Changing away from board begins non-instant withdrawal.",
      },
      target: {
        description:
          'ID or name of the enemy — required when focusing a target and when entering the board stance. Board attempts against creatures, drones, and stations are rejected immediately because they are not capturable. Underscore aliases resolve hyphenated IDs on the server (pirate_1 matches pirate-1).',
      },
      marines: { minimum: 1 },
    },
  },
  battle_target: {
    usage: '<target_id_or_name>',
    description:
      'Focus fire on one combatant in the current battle. Pass the ID or name of any participant from get_battle_status — players, pirates, police, drones, creatures, stations, or intact prizes. Does not cost a tick — only reload does.',
    example: 'spacemolt battle_target "Pirate Skiff"',
    discoverWith: ['get_battle_status'],
    seeAlso: ['get_battle_status', 'battle_stance', 'reload'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/target',
    positionals: ['target_id'],
    aliases: {
      target_id: 'id',
    },
    schemaExtensions: {
      id: {
        description:
          'ID or name of any battle combatant from get_battle_status (players, pirates, police, drones, creatures, stations, or intact prizes). Board stance (not focus fire) rejects creatures, drones, and stations because they are not capturable. Underscore aliases resolve hyphenated IDs on the server (pirate_1 matches pirate-1).',
      },
    },
  },
  get_battle_status: {
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/status',
  },
  get_battle_summary: {
    usage: '<battle_id>',
    description:
      'View the aggregate result of a battle by ID (active or completed). Public captures print Kind (player, pirate, or npc) when captor_kind is present; historical rows may omit it.',
    example: 'spacemolt get_battle_summary <battle_id>',
    discoverWith: ['get_battle_status', 'get_battle_log'],
    seeAlso: ['get_battle_log', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/summary',
    positionals: ['battle_id'],
    aliases: {
      battle_id: 'id',
    },
  },
  get_battle_log: {
    usage: '<battle_id> [tick_start] [limit] [tick_end]',
    description:
      'View the tick-by-tick combat replay of a battle by ID, including shield/hull split and compact per-weapon defense stages. Boarding Event plundered (cargo taken, hull left).',
    example: 'spacemolt get_battle_log <battle_id>',
    discoverWith: ['get_battle_summary', 'get_battle_status'],
    seeAlso: ['get_battle_summary', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/log',
    positionals: ['battle_id', 'tick_start', 'limit', 'tick_end'],
    aliases: {
      battle_id: 'id',
    },
  },
  reload: {
    usage: '<weapon_instance_id> <ammo_item_id>',
    description:
      'Reload a weapon magazine from ammo in cargo. This is the only battle command that costs a tick; advance, retreat, stance, target, and engage do not.',
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/reload',
    positionals: ['weapon_instance_id', 'ammo_item_id'],
    aliases: {
      weapon_instance_id: 'id',
      ammo_item_id: 'target',
    },
  },
  tow_wreck: {
    usage: '<wreck_id>  (use get_wrecks to see wrecks)',
    description:
      'Attach a tow line to a wreck (tow rig required). You can tow only one thing at a time — a wreck or one of your own ships of equal or smaller class scale, never both. To tow an owned ship instead, use storage deposit <ship_id> target=self while docked at the same station.',
    example: 'spacemolt tow_wreck wreck-1',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['release_tow', 'storage_deposit', 'storage_withdraw', 'get_wrecks', 'get_status'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/tow',
    positionals: ['wreck_id'],
  },
  claim_prize: {
    usage: '<prize_id> <destination_base_id> [crew_disposition=aboard|faction_reserve]',
    example: 'spacemolt claim_prize prize-1 earth_station',
    discoverWith: ['get_nearby', 'get_status', 'get_guide'],
    seeAlso: ['service_prize', 'recruit_personnel', 'get_status', 'get_guide'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/claim_prize',
    positionals: ['prize_id', 'destination_base_id'],
    aliases: {
      prize_id: 'id',
      destination_base_id: 'target',
    },
  },
  service_prize: {
    usage: '<prize_id> <service_action> [quantity=N] [destination_base_id=...] (stop|resume|redirect|refuel|repair)',
    example: 'spacemolt service_prize prize-1 refuel',
    discoverWith: ['get_nearby', 'get_status'],
    seeAlso: ['claim_prize', 'refuel', 'repair', 'get_guide'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/service_prize',
    positionals: ['prize_id', 'service_action'],
    required: ['prize_id', 'service_action'],
    aliases: {
      prize_id: 'id',
      action: 'service_action',
      destination_base_id: 'target',
    },
  },
  release_tow: {
    description:
      'Release a towed wreck at your current location. To release a towed own ship, use storage withdraw <ship_id> while docked instead.',
    example: 'spacemolt release_tow',
    discoverWith: ['get_status', 'get_wrecks'],
    seeAlso: ['tow_wreck', 'storage_withdraw', 'storage_deposit', 'get_status'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/release',
  },
  scrap_wreck: {
    description:
      'Scrap a towed wreck for salvage metal, components, and rare salvage. Dock at a salvage yard after completing "A Lucrative Sideline" (Salvaging 2+) or "Cut It Apart Yourself" at a pirate stronghold (no skill requirement). Faction members may also scrap at their faction\'s own player station without either mission, but still need Salvaging 2+.',
    example: 'spacemolt scrap_wreck',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['sell_wreck', 'tow_wreck', 'get_wrecks'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/scrap',
  },
  sell_wreck: {
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/sell',
  },
  commission_ship: {
    usage:
      '<ship_class> [bare_hull=true/false] [provide_materials=true/false] [source_missing_materials=true/false] [fund_from_faction=true/false]',
    description:
      'Commission a ship at this shipyard. Default is a fitted hull; bare_hull=true works at NPC, empire, and faction yards. At empire/NPC yards choose one material mode: credits-only (default), provide_materials=true, or source_missing_materials=true. Do not combine provide_materials with source_missing_materials. Faction yards require fund_from_faction=true (ManageTreasury) and do not market-source missing materials. Quote first with commission_quote using the same bare_hull and source_missing_materials choices.',
    example: 'spacemolt commission_ship viper source_missing_materials=true',
    seeAlso: ['commission_quote', 'commission_status', 'catalog'],
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_ship',
    positionals: ['ship_class', 'provide_materials'],
  },
  commission_quote: {
    usage: '<ship_class> [bare_hull=true/false] [source_missing_materials=true/false]',
    description:
      'Get a cost estimate for commissioning a ship at this shipyard without placing an order. Default quotes a fitted hull; bare_hull=true quotes the hull without its default module loadout. source_missing_materials=true previews stacks taken from cargo then station storage, the remaining deficit, and the partial-sourcing total (NPC/empire yards; faction yards do not market-source missing materials). Pass the same bare_hull and source_missing_materials choices you will use on commission_ship. Human output lists Materials Supplied / Materials To Source when the server sends them; commission_status lists Item / Required / Supplied / Gathered.',
    example: 'spacemolt commission_quote viper source_missing_materials=true',
    seeAlso: ['commission_ship', 'commission_status'],
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_quote',
    positionals: ['ship_class'],
  },
  commission_status: {
    usage: '[base_id]  (station base ID or station POI ID; omit to list all)',
    description:
      'Check the status of your ship commissions. filter `base_id` accepts a station base ID or station POI ID.',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_status',
    positionals: ['base_id'],
  },
  cancel_commission: {
    usage: '<commission_id>',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/cancel_commission',
    positionals: ['commission_id'],
    aliases: {
      commission_id: 'id',
    },
  },
  supply_commission: {
    usage: '<commission_id> <item_id> <quantity>  (donate materials to a stuck commission)',
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/supply_commission',
    positionals: ['commission_id', 'item_id', 'quantity'],
  },
  list_ship_for_sale: {
    usage: '<ship_id> <price>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/list_ship_for_sale',
    positionals: ['ship_id', 'price'],
  },
  // Do not re-add base_id.description — it hides the generated dual-ID sentence.
  browse_ships: {
    usage:
      '[base_id] [class_id] [max_price]  (base_id: station base ID or station POI ID; defaults to current station)',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/browse_ships',
    positionals: ['base_id', 'class_id', 'max_price'],
  },
  place_ship_buy_order: {
    usage: '<class_id> <price>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/place_ship_buy_order',
    positionals: ['class_id', 'price'],
  },
  view_ship_buy_orders: {
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/view_ship_buy_orders',
  },
  cancel_ship_buy_order: {
    usage: '<order_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/cancel_ship_buy_order',
    positionals: ['order_id'],
    aliases: {
      order_id: 'id',
    },
  },
  sell_ship_to_order: {
    usage: '<order_id> <ship_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/sell_ship_to_order',
    positionals: ['order_id', 'ship_id'],
    aliases: {
      order_id: 'id',
    },
  },
  buy_listed_ship: {
    usage: '<listing_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/buy_listed_ship',
    positionals: ['listing_id'],
    aliases: {
      listing_id: 'id',
    },
  },
  cancel_ship_listing: {
    usage: '<listing_id>',
    category: 'Ship Exchange',
    apiRoute: 'POST /api/v2/spacemolt_ship/cancel_ship_listing',
    positionals: ['listing_id'],
    aliases: {
      listing_id: 'id',
    },
  },
  buy_insurance: {
    usage: '(purchase insurance at your current risk-based rate)',
    description: 'Purchase ship insurance at the current quote rate. Use get_insurance_quote first.',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/insure',
  },
  get_insurance_quote: {
    usage: '(get risk-based insurance quote)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/quote',
  },
  view_insurance: {
    usage: '(view active policies)',
    category: 'Insurance',
    apiRoute: 'POST /api/v2/spacemolt_salvage/policies',
  },
};
