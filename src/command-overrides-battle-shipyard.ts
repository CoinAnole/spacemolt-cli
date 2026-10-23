import { WILDLIFE_FLEE_WINDOW_HELP } from './command-overrides-core';
import type { CommandOverride } from './commands';

export const BATTLE_SHIPYARD_COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  arena_status: {
    description:
      "Show your arena lobby: whether your current POI hosts arena matches, lifetime wins/losses/knockouts, any incoming or outgoing challenge, the arena battle you are in, live NPC-challenge match state (elapsed ticks, ticks remaining, enemies and waves remaining, objective) when you are in one, and today's arena XP per skill against the daily cap.",
    example: 'spacemolt arena status',
    seeAlso: ['arena_challenge', 'arena_accept', 'arena_challenges', 'arena_fight', 'get_battle_status', 'get_nearby'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/status',
  },
  arena_challenge: {
    usage: '<player> [max_side_size=N]  (0 = every eligible fleet member at the arena joins; 1 = solo duel)',
    description:
      'Challenge a pilot at your arena POI to consequence-free combat on the normal battle engine. Both sides must stay undocked at the arena until the challenge is answered; only one pending challenge per player. Ships, crew, and drones are restored after the match.',
    example: 'spacemolt arena challenge Kestrel max_side_size=1',
    discoverWith: ['get_poi', 'get_nearby', 'arena_status'],
    seeAlso: ['arena_status', 'arena_cancel', 'arena_accept'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/challenge',
    positionals: ['player'],
    aliases: { player_id: 'id' },
  },
  arena_accept: {
    description:
      'Accept the incoming arena challenge shown by arena status. The arena battle starts immediately; fight it with get_battle_status, battle_target, and battle_stance.',
    example: 'spacemolt arena accept',
    discoverWith: ['arena_status'],
    seeAlso: ['arena_status', 'arena_decline', 'get_battle_status', 'battle_target', 'battle_stance'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/accept',
  },
  arena_decline: {
    description: 'Decline the incoming arena challenge shown by arena status.',
    example: 'spacemolt arena decline',
    discoverWith: ['arena_status'],
    seeAlso: ['arena_status', 'arena_accept'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/decline',
  },
  arena_cancel: {
    description: 'Withdraw your own unanswered arena challenge.',
    example: 'spacemolt arena cancel',
    discoverWith: ['arena_status'],
    seeAlso: ['arena_status', 'arena_challenge'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/cancel',
  },
  arena_challenges: {
    description:
      'List every NPC arena trial by series and stage: whether it is ready here, needs travel, or is locked, the enemy line (runners marked flees), win condition, reinforcement waves, active loadout rules, and your win count. Start one with arena fight <challenge_id>.',
    example: 'spacemolt arena challenges',
    discoverWith: ['arena_status', 'get_poi'],
    seeAlso: ['arena_fight', 'arena_status', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/challenges',
  },
  arena_fight: {
    usage: '<challenge_id>',
    description:
      'Start an unlocked NPC trial at this arena. challenge_id comes from arena challenges. Locked trials refuse with challenge_locked. A ship that breaks a loadout rule refuses the whole side with a rule_* error naming the pilot, hull, and rule. Fleet members at the arena join your side when the rules allow. The reply shows the opening enemies, win condition, and any reinforcement waves. Fight it with get_battle_status, battle_target, and battle_stance; track the live objective with arena status.',
    example: 'spacemolt arena fight two_on_one',
    discoverWith: ['arena_challenges'],
    seeAlso: ['arena_challenges', 'arena_status', 'get_battle_status', 'battle_target', 'battle_stance'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_arena/fight',
    positionals: ['challenge_id'],
    aliases: { challenge_id: 'id' },
  },
  battle_engage: {
    usage: '[side_id]  (optional numeric side; omit for faction-based auto-assignment)',
    description:
      "Join an existing battle. This command cannot start a battle. Pass side_id to choose a side. A passed side_id is not re-picked. A side_id that opposes your own faction's station returns own_faction_station. Omit side_id for faction-based auto-assignment. Omitting side_id joins your station's side when your faction's station is in the battle. When side_id is omitted, side selection no longer changes at random. Pirates join the lowest-numbered NPC side. If your faction is at war with a faction in a battle with three or more sides, you join the lowest-numbered side that is not the enemy's. 0.630.5 does not say whether an ally still comes first when that disagrees with those two sentences. Fleet and faction auto-joins no longer pull you into a fight against your own faction's station. Your drones no longer open a side against it. Does not cost a tick — only reload does.",
    example: 'spacemolt battle_engage 1',
    discoverWith: ['get_battle_status'],
    seeAlso: ['attack', 'get_battle_status', 'battle_target', 'battle_stance'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/engage',
    positionals: ['side_id'],
    schemaExtensions: {
      side_id: {
        description:
          "Numeric side. Passing side_id chooses that side and is not re-picked. A side that opposes your faction's station returns own_faction_station. Omit side_id to join your station's side when your faction's station is in the battle. Omitted side_id does not change at random: pirates join the lowest-numbered NPC side, and if your faction is at war with a faction in a battle with three or more sides, you join the lowest-numbered side that is not the enemy's.",
      },
    },
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
      'Set your battle stance (fire, evade, brace, flee, or board). ' +
      WILDLIFE_FLEE_WINDOW_HELP +
      " For board, the server requires target and marines=N (fit marines committed; the battle tick caps to marines actually available); other stances still take only <stance>. The CLI rejects marines below 1. A faster effective speed lets the boarder intercept the target's retreat and flee; an equal or faster target can kite. Changing away from board begins a non-instant withdrawal. Does not cost a tick — only reload does.",
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
          "Battle stance: fire (100% dmg dealt/taken), evade (0%/50%, costs fuel), brace (0%/25%, shields regen 2x), flee (0%/100%, auto-retreats to escape), or board (0%/100%, automatically closes for repeated latch attempts; the server requires target and marines). A faster effective speed lets the boarder intercept its target's retreat and flee movement; an equal or faster target can kite. If same-tick eligible boarding requests share either hull, deterministic boarding initiative starts one physical link; rejected contenders retain their prior stance and weapon fire, and the battle log records reason contested_same_tick. Changing away from board begins non-instant withdrawal. " +
          WILDLIFE_FLEE_WINDOW_HELP,
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
    discoverWith: ['get_battle_status', 'get_battle_log', 'list_battles'],
    seeAlso: ['get_battle_log', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/summary',
    positionals: ['battle_id'],
    aliases: {
      battle_id: 'id',
    },
  },
  list_battles: {
    usage: '[search=name] [category=pirate|pvp|police|wildlife|arena] [limit=1-100] [offset=0] [captured=true]',
    description:
      "List public battles. No login. GET /api/battles. This is public history. A capture row is not the caller's prize. Call claim_prize only with a prize_id from a capture you took. Arena rows omit prize fields. Omitting category uses the server's default feed. captured=true lists only battles in which a ship was captured by boarding; paging and totals reflect that filter. captured=false is not a negative filter and is not sent. Wildlife are not boarding captures, so do not combine category=wildlife with captured=true. If you do, the server returns battle history temporarily unavailable. The CLI retries only through the existing 503 policy and then stops. Page with limit (1-100; omit for the server default of 20) and offset. search matches participant names only. It is a case-insensitive substring of a participant name, not a system, faction tag, or ship class. An interrupted hunt is left off this list; read one battle with get_battle_summary. Do not poll. This uses the public web/data API budget, 60 requests per minute per IP (public_api). See limits.md. catalog_dump is a separate 1 request per minute endpoint and is not this budget.",
    example:
      'spacemolt list_battles; spacemolt list_battles captured=true; spacemolt list_battles category=arena captured=true; spacemolt list_battles search=Probe offset=20 limit=20; spacemolt list_battles category=wildlife limit=20; spacemolt list_battles --captured --limit 20',
    seeAlso: ['get_battle_summary', 'get_battle_log', 'claim_prize'],
    category: 'Battle',
    route: {
      tool: 'public',
      action: 'battles',
      method: 'GET',
      rootPath: 'api/battles',
      publicUnauthenticated: true,
      bareResponse: true,
    },
    schemaExtensions: {
      search: {
        type: 'string',
        description: 'Case-insensitive substring of a participant name. Not a system, faction tag, or ship class.',
      },
      category: {
        type: 'string',
        description:
          'Category token. Omit to use the server default feed. Wildlife are not boarding captures; do not combine category=wildlife with captured=true. Case-sensitive.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Page size. Omit for the server default of 20.',
      },
      offset: { type: 'integer', minimum: 0, description: 'Rows to skip. 0 is the first page.' },
      captured: {
        type: 'boolean',
        description: 'When true, only battles in which a ship was captured by boarding. false is not sent.',
      },
    },
  },
  get_battle_log: {
    usage: '<battle_id> [tick_start] [limit] [tick_end]',
    description:
      'View the tick-by-tick combat replay of a battle by ID, including shield/hull split and compact per-weapon defense stages. Boarding Event plundered (cargo taken, hull left).',
    example: 'spacemolt get_battle_log <battle_id>',
    discoverWith: ['get_battle_summary', 'get_battle_status', 'list_battles'],
    seeAlso: ['get_battle_summary', 'get_battle_status'],
    category: 'Battle',
    apiRoute: 'POST /api/v2/spacemolt_battle/log',
    positionals: ['battle_id', 'tick_start', 'limit', 'tick_end'],
    aliases: {
      battle_id: 'id',
    },
  },
  reload: {
    usage:
      '[weapon_instance_id] [ammo_item_id] [weapons=JSON]  (bulk: pass weapons=[{weapon_instance_id, ammo_item_id?}, ...] and omit weapon_instance_id and ammo_item_id; max 50; one tick)',
    description:
      'Reload one weapon or mining gun magazine from ammo in cargo, or pass weapons=JSON to reload up to 50 weapons or mining guns in one action. Each entry is {weapon_instance_id, ammo_item_id?}; an entry may omit ammo_item_id for ammo_from_cargo weapons (junk auto-select). Entries are independent — each succeeds or fails on its own. Omit weapon_instance_id and ammo_item_id when using weapons (those are the single-weapon arguments, sent as id and target). Inside the array the keys stay weapon_instance_id and ammo_item_id. ammo_item_id accepts an item id or a cached display name, same as the top-level ammo argument. weapon_instance_id is a fitted weapon or mining gun and is not resolved. This is the only battle command that costs a tick — one tick for a single reload or for the whole batch; advance, retreat, stance, target, and engage do not.',
    example:
      'spacemolt reload weapon-1 ammo_kinetic_small; bulk: spacemolt reload weapons=\'[{"weapon_instance_id":"weapon-1","ammo_item_id":"ammo_kinetic_small"},{"weapon_instance_id":"weapon-2"}]\'',
    discoverWith: ['get_ship', 'get_cargo'],
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
      'Attach a tow line to a wreck (tow rig required). You can tow only one thing at a time — a wreck or one of your own ships of equal or smaller class scale, never both. To tow an owned ship instead, use storage deposit <ship_id> target=self while docked at the same station. The wreck must be at your POI; a wreck elsewhere returns wreck_not_found. wreck_not_found is only this miss. A stale tow on sell_wreck, scrap_wreck, or a complete_mission wreck turn-in is wreck_not_here, not this code.',
    example: 'spacemolt tow_wreck wreck-1',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['release_tow', 'storage_deposit', 'storage_withdraw', 'get_wrecks', 'get_status'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/tow',
    positionals: ['wreck_id'],
  },
  claim_prize: {
    description:
      'Assign prize crew and begin recovery of an intact captured ship. The prize sits at the battle origin POI, which can differ from your current POI; travel there, then claim.',
    usage: '<prize_id> <destination_base_id> [crew_disposition=aboard|faction_reserve]',
    example: 'spacemolt claim_prize prize-1 earth_station',
    discoverWith: ['get_notifications', 'get_system', 'get_status', 'get_guide'],
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
    description:
      'Stop, resume, redirect, refuel, or repair a claimed intact prize. Both ships must be out of combat at the same POI. Stop, resume, and redirect are claimant-only. Refuel and repair also accept a faction-mate of the claimant once that faction runs an operational Prize Recovery Yard at any station; a yard under construction or damaged does not unlock it. Refuel spends fuel from your own ship. Repair spends any repair item from your cargo. Omit item_id to use the cheapest repair item in your cargo; pass item_id=<id> to choose one. On refuel, omit quantity or pass 0 to transfer the safe maximum fuel. On repair, omit quantity or pass 0 to spend one repair item.',
    usage:
      '<prize_id> <service_action> [quantity=N] [item_id=...] [destination_base_id=...] (stop|resume|redirect|refuel|repair)',
    example: 'spacemolt service_prize prize-1 refuel',
    discoverWith: ['get_nearby', 'get_status'],
    seeAlso: ['claim_prize', 'refuel', 'repair', 'faction_facility_owned', 'get_guide'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/service_prize',
    positionals: ['prize_id', 'service_action'],
    required: ['prize_id', 'service_action'],
    aliases: {
      prize_id: 'id',
      action: 'service_action',
      destination_base_id: 'target',
    },
    schemaExtensions: {
      service_action: {
        description:
          'Physical recovery action. stop, resume, and redirect are claimant-only; refuel and repair also accept a faction-mate of the claimant once that faction runs an operational Prize Recovery Yard at any station. A yard under construction or damaged does not unlock it.',
      },
    },
  },
  release_tow: {
    description:
      "Clear a wreck tow without moving the wreck. The wreck stays where it lies, including when the tow is stale. A stale tow cannot release another tower's claim. During a wreck update this returns wreck_busy; retry release_tow next tick. To unload a towed own ship, use storage withdraw <ship_id>. The ship must be at the same station, and that withdraw can auto-dock first.",
    example: 'spacemolt release_tow',
    discoverWith: ['get_status', 'get_wrecks'],
    seeAlso: ['tow_wreck', 'storage_withdraw', 'storage_deposit', 'get_status'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/release',
  },
  scrap_wreck: {
    description:
      'Scrap a towed wreck for salvage metal, components, and rare salvage. Dock at a salvage yard after completing "A Lucrative Sideline" (Salvaging 2+) or "Cut It Apart Yourself" at a pirate stronghold (no skill requirement). Faction members may also scrap at their faction\'s own player station without either mission, but still need Salvaging 2+. Remaining wreck cargo and modules are deposited to station storage and listed in the materials receipt. A stale tow returns wreck_not_here. Run release_tow, then tow the wreck again where it lies. Do not retry scrap_wreck until then.',
    example: 'spacemolt scrap_wreck',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['sell_wreck', 'tow_wreck', 'get_wrecks', 'storage_view'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/scrap',
  },
  sell_wreck: {
    description:
      "Sell a towed wreck to an NPC salvage yard for credits. The yard pays a fraction of the hull materials and remaining cargo at local market value from the station manager's credits. A broke manager may pay less than the offer (the message says so). Player-owned yards refuse; use scrap_wreck there instead. Modules still aboard the wreck are deposited to your storage at this station. A stale tow returns wreck_not_here. Run release_tow, then tow the wreck again where it lies. Do not retry sell_wreck until then.",
    example: 'spacemolt sell_wreck',
    discoverWith: ['get_wrecks', 'get_status'],
    seeAlso: ['scrap_wreck', 'tow_wreck', 'get_wrecks', 'storage_view', 'view_market'],
    category: 'Salvage & Tow',
    apiRoute: 'POST /api/v2/spacemolt_salvage/sell',
  },
  commission_ship: {
    usage:
      '<ship_class> [bare_hull=true/false] [provide_materials=true/false] [source_missing_materials=true/false] [fund_from_faction=true/false]',
    description:
      "Commission a ship at this shipyard. Default is a fitted hull; bare_hull=true works at NPC, empire, and faction yards. At empire/NPC yards choose one material mode: credits-only (default), provide_materials=true, or source_missing_materials=true. Do not combine provide_materials with source_missing_materials. Faction yards require fund_from_faction=true (ManageTreasury) and do not market-source missing materials. Quote first with commission_quote using the same bare_hull and source_missing_materials choices. A faction buy_ship_license for this hull covers required_reputation at your faction's own station; Piloting still applies to flyable hulls; shipyard tier and materials still apply. A catalog ship whose entry has mobile_base (class Mobile Base: Civitas, Siege Foundry, Foundation, Here to Stay, Emanation) is a faction station commissioned with this command at a tier-four faction shipyard, not a new route. fund_from_faction=true still applies. Mobile-base construction also needs ManageBases (the base-builder guide; the commission_ship route description does not name that permission). Ship modules, piloting, speed, cargo, and ship fuel do not apply to those mobile-base blueprints. Hull, shields, armor, and shield recharge are station combat stats. Construction cost is commission_quote, not the jump resource. Jump resources are escrowed later by faction jump_mobile_base.",
    example: 'spacemolt commission_ship viper source_missing_materials=true',
    seeAlso: ['commission_quote', 'commission_status', 'catalog', 'buy_ship_license'],
    category: 'Shipyard',
    apiRoute: 'POST /api/v2/spacemolt_ship/commission_ship',
    positionals: ['ship_class', 'provide_materials'],
  },
  commission_quote: {
    usage: '<ship_class> [bare_hull=true/false] [source_missing_materials=true/false]',
    description:
      'Get a cost estimate for commissioning a ship at this shipyard without placing an order. Default quotes a fitted hull; bare_hull=true quotes the hull without its default module loadout. source_missing_materials=true previews stacks taken from cargo then station storage, the remaining deficit, and the partial-sourcing total (NPC/empire yards; faction yards do not market-source missing materials). Pass the same bare_hull and source_missing_materials choices you will use on commission_ship. Human output lists Materials Supplied / Materials To Source when the server sends them; commission_status lists Item / Required / Supplied / Gathered. The same ship_class quotes a mobile-base blueprint; the quote is the construction bill; it is not the jump resource.',
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
    description:
      'Donate one material type to a stuck commission from cargo then station storage. Table output lists material names with needed/gathered progress.',
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
