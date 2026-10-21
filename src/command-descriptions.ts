export const CURATED_COMMAND_DESCRIPTIONS: Record<string, string> = {
  abandon_mission: 'Abandon an active mission',
  accept_mission:
    "Accept a mission from the station board, or claim a distress-response rescue (gameserver 0.608.0). Board contracts require docking at the issuing base. A distress rescue has no issuing base: pass the mission_id from the emergency broadcast or from the caller's distress_signal response, from anywhere, docked or not. First claim wins. A claimed rescue counts toward the 5-mission cap. Server-generated calls expire after 30 minutes; player calls expire in 3 hours.",
  analyze_market:
    "Get actionable trading insights at your current station. Insights only reference stations in systems you have visited. They show no other faction's private orders, no fuel sell orders, and no contraband you cannot trade at that station. Your own faction's Company Store can still appear, the same as on view_market. Contraband you can trade at that station is included, including at a contraband-friendly station (pirate strongholds, Outer Rim stations, Treasure Cache). This is not a full view_market snapshot (fuel and contraband there stay the since rule) and not the subscribe_market feed.",
  browse_ships: 'Browse ships listed for sale at a station',
  buy_insurance: 'Purchase ship insurance',
  buy_listed_ship:
    'Purchase a ship from the exchange. Buying a listed ship releases a towed wreck where it lies. Returns already_towing while you tow a ship. Unload that ship first with storage withdraw <ship_id>. The ship must be at the same station, and that withdraw can auto-dock first.',
  cancel_commission: 'Cancel a pending or in-progress ship commission',
  cancel_order:
    'Cancel an active order and return escrow. On a buy order, after modify_order changes the price, that refund includes the sales tax the reprice escrowed. Sell cancels still return remaining items to station storage. Sales tax on create_buy_order is unchanged.',
  cancel_ship_listing: 'Remove your ship listing from the exchange',
  captains_log_add: 'Add an entry to your captain log.',
  captains_log_delete: 'Delete a specific entry from your captain log.',
  captains_log_get: 'Get a specific entry from your captain log.',
  captains_log_list: 'List all entries in your captain log.',
  claim: 'Link your player to your website account using a registration code',
  claim_prize:
    'Assign prize crew and begin recovery of an intact captured ship. The prize sits at the battle origin POI, which can differ from your current POI; travel there, then claim.',
  cloak:
    'Toggle the cloaking device. You cannot engage a cloak during a battle (in_battle). Attacking or engaging drops an active cloak.',
  commission_quote:
    'Get a cost estimate for commissioning a ship, including bare-hull and partial-sourcing previews. The same ship_class quotes a mobile-base blueprint; the quote is the construction bill, not the jump resource.',
  commission_ship:
    "Commission a ship at this shipyard. Default fitted; optional bare_hull. Empire/NPC: credits, provide_materials, or source_missing_materials (not both). Faction yards: fund_from_faction=true (ManageTreasury), no market sourcing. A faction license covers required_reputation at your faction's own station; Piloting still applies to flyable hulls. A mobile-base blueprint is a faction station at a tier-four faction yard; ship modules and piloting do not apply, and the arguments are unchanged.",
  commission_status: 'Check the status of your ship commissions',
  complete_mission:
    'Complete a mission and claim rewards. A wreck turn-in needs your tow claim and the wreck at your POI. A stale tow returns wreck_not_here. Run release_tow, then tow the wreck again where it lies. Do not retry complete_mission until then.',
  completed_missions: 'List all missions you have completed',
  craft: 'List queued jobs (no recipe), or queue craft/package pack/unpack jobs (storage/faction; cargo for packages).',
  create_buy_order:
    'Place a buy offer on the station exchange. A hazardous instant fill goes to station storage when the ship has no hazmat cargo module.',
  create_faction: 'Create a new faction',
  create_note:
    'Create a new note document. Notes take no cargo space (gameserver 0.632.5). A full hold still accepts a new note, and create_note does not return cargo_full.',
  create_sell_order: 'List items for sale on the station exchange',
  decline_mission: 'Decline a mission and hear the NPC response.',
  delete_note:
    'Permanently delete a note document you own. Deleting a note leaves cargo unchanged and does not free a cargo unit (gameserver 0.632.5).',
  deploy_drone: 'Deploy a drone from your bay into space',
  distress_signal:
    'Broadcast a fuel, repair, or combat emergency and post one claimable rescue (gameserver 0.608.0). Nobody is assigned it. The response carries mission_id; the first pilot to call accept_mission with that id takes the rescue, docked or not. mission_id is empty when responders_reached is 0 (nobody in range heard you). responders_reached is how many online pilots within 5 jumps heard the call, not how many are coming. Cannot be used while docked. One active distress at a time; 1-hour cooldown. Unclaimed player-call rescues expire in 3 hours (expires_seconds 10800), or earlier if you travel away under your own power. Omit type to default to fuel.',
  estimate_purchase: 'Preview what buying would cost without executing',
  faction_accept_invite: 'Accept a faction invitation.',
  faction_accept_peace: 'Accept a peace proposal',
  faction_cancel_mission: 'Cancel a posted faction mission and refund escrowed rewards',
  faction_create_buy_order: 'Create a buy order on behalf of your faction.',
  faction_create_role: 'Create a custom faction role',
  faction_create_sell_order: 'Create a sell order on behalf of your faction.',
  faction_declare_war: 'Declare war on another faction',
  faction_decline_invite: 'Decline a faction invitation',
  faction_delete_role: 'Delete a custom faction role',
  faction_delete_room: 'Delete a room from your faction common space.',
  faction_deposit_credits: 'Transfer credits from your wallet to the faction treasury.',
  faction_edit: 'Update faction description, charter, colors, and ally-sharing toggles',
  faction_edit_role: 'Edit a custom faction role',
  faction_facility_list:
    'List faction facilities at the current station, including status (active, damaged, repairing, under construction, dismantling).',
  faction_facility_owned: 'List faction facilities across all stations.',
  faction_get_invites: 'View pending faction invitations',
  faction_info:
    'View faction details. When faction_rent is present, table output prints the treasury facility bill, and an explicit 0 prints 0cr/cycle; an omitted faction_rent prints nothing (a non-member, or a faction that owns no facilities — not an error and not zero rent). Per-facility rates are faction facility_owned. When mobile_base is present, table output prints the member snapshot after the rent lines; an omitted key prints nothing. An empty current_system_id prints System: (empty) and the departure system is the Origin line. Explicit 0 ticks and empty endpoints print as zero or empty. mobile_base_commission prints the commission id and archetype while a base is under construction and prints nothing when omitted. The two are mutually exclusive on the server. Escrow is not on this command; use faction get_mobile_base.',
  faction_intel_status: 'View faction intel coverage statistics',
  faction_invite: 'Invite a player to your faction',
  faction_kick: 'Kick a player from your faction',
  faction_list: 'List all factions',
  faction_list_missions: 'List your faction posted contracts at this station, including bounty targets.',
  faction_personnel: "View, recruit, or transfer personnel held in your faction's local reserve",
  faction_post_mission: 'Post a mission on your faction mission board.',
  faction_promote: 'Promote or demote a faction member',
  faction_propose_ally: 'Propose an alliance with another faction',
  faction_propose_peace: 'Propose peace to a faction you are at war with.',
  faction_query_intel:
    "Query your faction intel database. faction query_intel table output prints message only when it is a string and the trimmed text is non-empty, and it prints that trimmed text with no label. Whitespace and non-strings print nothing. It prints Live systems: and the live_systems ids when that array is sent. An omitted live_systems prints nothing. An empty array prints Live systems: (none). A system is listed only while an online member of the source faction is at a POI there right now. The source faction is your own, or the ally named by source_faction_id. An intel facility, or a member elsewhere in the system, does not make it live. Each POI prints Read at tick: from read_at_tick. An omitted read_at_tick prints unverified. That is a hand-submitted reading and is not tick 0. An explicit 0 prints 0. A safe integer or bigint prints ungrouped digits. live means that tick equals current_tick and this system_id is listed. Any other exact tick prints snapshot, and it prints an age in ticks only when current_tick is an exact tick and current_tick minus read_at_tick is zero or more. A future tick, or a missing or non-integer current_tick, prints snapshot with no age. A float, numeric string, boolean, or object prints Read at tick: and that value, with no unverified, live, snapshot, or age. Intel tick age uses that same non-negative exact difference. A negative difference omits the age. A safe-integer age is unchanged, age 5 ticks. Omitted resources means nobody has read that POI's ore. A jump or get_system records layout, not ore. Ore is recorded by get_poi, mining, or survey_system. Table output prints Description: plus the trimmed system or POI text only when description is a non-empty string, prints nothing when the key is omitted, blank, or not a string, skips a description whose trimmed text equals the printed message, and does not remove description from --json, --yaml, or --structured.",
  faction_remove_ally: 'Dissolve an alliance with another faction',
  faction_remove_enemy: 'Return an enemy faction to neutral standing',
  faction_rooms: 'List rooms in your faction common space at the current station.',
  faction_set_enemy: 'Mark another faction as enemy',
  faction_submit_intel:
    'Submit system intel to your faction shared map with faction submit_intel. Submitted resource readings never get read_at_tick, so faction query_intel prints them as unverified, not as tick 0. The server keeps a POI only when its id is a real POI of that system on your charts. A jump or get_system records layout, not ore.',
  faction_submit_trade_intel: 'Submit market price observations to your faction trade ledger.',
  faction_trade_intel_status: 'View faction trade intelligence coverage statistics',
  faction_visit_room: 'Visit a room in your faction common space and read its description.',
  faction_withdraw_credits: 'Transfer credits from the faction treasury to your wallet.',
  faction_withdraw_invite: 'Withdraw a pending invite you sent',
  faction_write_room: 'Create or update a room in your faction common space.',
  find_route:
    'Find the shortest route to a destination system, POI, or station. An uncharted hidden POI is not found (system_not_found), the same as an unknown id. Chart it with survey_system, by arriving, or through faction intel. A wormhole step (via_wormhole true) is a jump to entrance_poi in the previous system. A missing route is route null with the fuel fields at 0. estimated_fuel is fuel_per_jump times total_jumps. A negative fuel_on_arrival means that ship, including yours, runs out on the way. fleet_fuel is sent only when you lead a fleet with more than one member and a route was found; the rows include your ship, and members without a ship are skipped.',
  facility_job_add: 'Queue production work on a facility you own.',
  facility_job_cancel: 'Cancel queued facility jobs and refund unspent escrow.',
  facility_job_list: 'List queued production jobs on a facility you own.',
  facility_job_reorder: 'Move a queued facility job to a new position.',
  facility_owned:
    "List every facility you own across all stations. Rent/cycle on each row is the server's stored rent_per_cycle. An explicit 0 prints 0 and is not replaced with a sentence. Personal rent bill is the server rent summary, and an explicit 0 prints 0cr/cycle. Anyone outside a faction who owns a facility at that faction's player station pays rent each cycle to the faction's treasury. The faction and its members pay nothing there, so quotes and rent totals for them are 0, not an omitted field. Joining that faction makes your facilities at its stations rent-free at once, and any unpaid rent on them is cleared (faction join). Leaving makes your facilities at the faction's stations tenancies that pay it rent each cycle (faction leave). A kicked player's facilities at the faction's stations become tenancies and pay it rent each cycle (faction kick). Changelog 0.618.2: arrears warnings and eviction match an NPC station (roughly 3 days). Gameserver 0.618.2, facility_reclaimed notification description (Notification_facility_reclaimed), not a property of that notice: at another faction's station, a repossessed production facility passes to that faction and any other facility is removed, with its build materials returned to the tenant's storage there, after the owning faction takes enough of them to cover the unpaid rent. Any rent the materials cannot cover is forgiven. The notice properties are base_id, base_name, facilities, faction_id, and message.",
  facility_set_access: 'Open or close a facility for public rental capacity.',
  facility_set_output_price: 'Set rental price: per-unit production fee, or once-per-package fee on Logistics.',
  forum_create_thread: 'Create a new forum thread',
  forum_delete_reply: 'Delete a forum reply',
  forum_delete_thread: 'Delete a forum thread',
  forum_edit_reply:
    'Edit your own reply in an unlocked, non-deleted thread (gameserver 0.629.0). Content replaces the full reply after server sanitization (5–5000 bytes). Edits grant no XP, send no notifications, and preserve votes, timestamps, and thread ordering. reply_id is the reply. Read the saved text with forum get_thread on the parent thread.',
  forum_edit_thread:
    'Edit your own unlocked, non-deleted thread (gameserver 0.629.0). Pass a new title, a new body, or both. An omitted field stays as saved. Category cannot change. The second positional is the title, same order as forum create_thread. A body-only edit is one quoted --content or content= value, or --content @file. Do not pass unquoted words after --content: the next word is the body, the word after it becomes the title, and any further word replaces the body and drops the flag value. Title is 5–100 bytes and content is 10–100000 bytes after server sanitization. Edits grant no XP, send no notifications, and preserve votes, timestamps, and thread ordering. Read the saved post with forum get_thread.',
  forum_get_thread: 'Get a forum thread and its replies',
  forum_list: 'List forum threads',
  forum_reply: 'Reply to a forum thread',
  forum_upvote:
    "Upvote a thread, or a reply in that thread (gameserver 0.630.6). thread_id is required and is sent as target. Omit reply_id to vote the thread. With reply_id the reply is voted, not the thread, and thread_id must be that reply's thread (reply_not_in_thread). There is no reply lookup. forum get_thread opens only a thread id from the page where the reply was read. It does not take reply_id, and a rejected thread_id is not that page. You cannot upvote your own thread or reply (cannot_upvote_own). Each player's upvote counts once: a repeat upvote succeeds, the server message says it was already upvoted, and the count does not change. A failed save is persist_failed. The vote is not counted, so retry the same command. The usual one-mutation-per-tick limit still applies.",
  get_action_log: 'Retrieve your or your faction persistent action history.',
  get_active_missions:
    'View your active missions, progress, and the server-issued mission description. jump, dock, mine, buy, sell, create_buy_order, create_sell_order, sell_wreck, scrap_wreck, survey_system, complete_mission, storage deposit, storage withdraw, storage loot, loot_wreck, craft, recycle, jettison, storage jettison, use_item, install_mod, and uninstall_mod re-print this table when the server includes envelope missions on that command. Partial cargo or storage progress reprints there. A kill, a crafting job that finishes on a later tick, a fill on a resting order, or a fleet or auto dock that completes an objective is an action_result whose command is mission_objective_completed. The CLI formats that frame when a notifications array already contains it. Cached gameserver text describes the unsolicited frame as a WebSocket v2 push. This CLI does not open a WebSocket. Keep using get_active_missions for kills and whenever the last mutation omitted missions. complete_mission prints remaining actives after the rewards block.',
  get_base:
    'Get docked station details. When facilities are damaged, table output shows the repair queue, hull recovery, combined supply shortages that count shared stock once, missing supplies, and how to deliver them. When authenticator production is blocked or price_limited, table output shows the sovereign mint report. It prints whichever of these the server sent, and more than one can appear in the same block: missing inputs such as Trade Crystals with buy order: yes or no per input, Price limits rows (station public buy and lowest public sell, in credits), and an internal mint-stage blocker. Status is printed as sent, including price_limited. price_limited means needed replenishment has public sell asks above the station public buy even if production continues. Those prices are a snapshot and are not a private spending ceiling. Sell only buy order: yes rows through the public market; check view_market for depth. Table output also prints Contraband mode and Contraband items from the station, including a mobile base, when the server sends those keys. The mode is printed as sent. default uses the general contraband rules. custom replaces them with the item ids. Null items print as (default rules). An empty item list when the mode is custom prints (none — all items allowed). Any other empty item list prints (none). An omitted key prints nothing. Item ids stay in server order. This is not the empire list from get_empire_info. Smuggling skill still bypasses listed items. Empire customs still apply in empire territory, including aboard a mobile base.',
  get_battle_status:
    "View current battle status. flee_required is a speed-adjusted escape baseline of 3 ticks from the outer zone, not a hard minimum of 3: faster than the fastest enemy ship chasing you can drop it to 1 or 2 (floor 1); slower or webbed raises it. Table output prints Flee Progress as counter/required when flee_required is present, and the counter alone when it is omitted. The field is omitted while warp-disrupted or boarding-intercepted, so its absence does not identify which; read warp_disrupted and intercepted. Table output prints Latch from combat_state.latch_status while you are latching onto a target. accruing means latch progress is gaining this tick. shields_holding means keep the target's shields down. out_of_range means close to point-blank first; suppressing shields does nothing at range. When both gates are shut the field is out_of_range. The line is omitted once your marines are aboard, omitted for the ship being boarded, and omitted when you are not latching. Latch is not the Boarding table Progress column.",
  get_battle_summary: 'View the aggregate result of a battle by ID',
  get_battle_log:
    'View the tick-by-tick combat replay of a battle by ID, including shield/hull split and compact per-weapon defense stages.',
  get_drone: 'Get full details for a specific drone, including script and memory.',
  get_insurance_quote: 'Get a risk-based insurance quote for your current ship',
  get_map:
    "View the galaxy chart: all systems, or one system's coordinates, connections, visit state, and chart description.",
  get_missions: 'Get available missions at your current station, including the server-issued description.',
  get_nearby: 'Show visible nearby players, NPCs, creatures, and intact prizes',
  get_notes: 'List all your note documents',
  get_poi: 'Get your current POI details',
  get_skills: 'Get your skill progress.',
  get_system_agents:
    'Deprecated and going away. Always returns an empty agent list. Use get_nearby for the ships at your POI, and get_system with a ship scanner for ship counts at the other POIs.',
  get_tax_estimate:
    'See current tax estimates, missed-tax payment guidance, outstanding bounties, and your latest weekly statement. inactivity_exempt means this period will skip income and property tax; existing debt remains. Next assessment uses remaining ticks times current tick duration. pay_bounty settles existing debt; prepay_tax reserves credits for the next assessment.',
  get_trades: 'View pending trade offers',
  get_version: 'Get game version and release notes.',
  get_wrecks: 'List wrecks and jettison containers at the current POI',
  install_mod:
    'Install a module on your ship. Skills do not gate fitting a module you own. Slots, CPU, power, and module-specific limits such as one boarding-contact defense decide the fit. When envelope missions is present, table output prints the Active Missions table, including partial progress. An omitted missions key prints nothing.',
  jettison:
    'Dump cargo into a lootable container; matching ore settles back into the belt when the container despawns.',
  join_faction:
    "Join a faction via invitation. You must have a pending invite. While you fight in a battle against one of that faction's stations, join_faction returns own_faction_station. Leave the battle first, then retry.",
  leave_faction: 'Leave your faction',
  list_ship_for_sale: 'List a stored ship for sale on the exchange',
  list_ships:
    'List every ship you own and where each is parked, including fitted module type ids. Works from anywhere. Use get_ship <id> for the full fit of a parked, garaged, or carried hull.',
  load_drone: 'Load a drone from cargo into your drone bay',
  loot_wreck:
    'Loot wreck cargo into your hold, or loot a wreck module into cargo as unfitted with module_id= (fit later with install_mod). Omit item_id and module_id to take every cargo stack that fits and leave the rest in the wreck. A wreck at another POI returns not_found, the same as a wreck that is already gone.',
  mine: 'Mine one cycle at the current POI (asteroid, ice, or gas).',
  modify_order:
    'Change the price on an existing order. Raising a buy above an older, cheaper sell fills at the sell price; the difference plus the extra sales tax you escrowed is action-log event trading.escrow_refunded (get_action_log event_type=trading.escrow_refunded), not a field on this response. On a buy, modify_order escrows sales tax so a later cancel refunds what you paid.',
  name_drone: 'Set or clear a display name for a drone.',
  name_ship: 'Set or clear a custom name for your active ship',
  petition: 'Send a petition to an empire government.',
  read_note: 'Read a note document contents.',
  recycle: "Queue lossy recycling that consumes a recipe's outputs from station storage.",
  recall_drone: 'Recall a deployed drone back to your bay',
  refit_ship:
    'Dock at a shipyard and reset the active ship to the current class definition. Hull stats reset and the class default loadout is installed. Installed modules and all cargo go to station storage; they are not destroyed. Free. Irreversible. A response message of already_current means the ship already matches current class stats and the default-loadout version, and nothing is applied. To restore your own fit, withdraw a returned module from station storage, then install_mod.',
  release_tow: 'Clear a wreck tow without moving the wreck',
  recruit_personnel: 'Recruit fit crew and marines at a station personnel service',
  reload:
    'Reload one magazine, or up to 50 weapons with weapons=JSON, in one tick. Ammo names inside the array resolve; weapon instance ids do not. Other battle commands do not cost a tick.',
  repair:
    'Repair hull at a station, with kits, or on another ship (named target=). repaired is hull actually restored.',
  scrap_ship: 'Permanently destroy a stored ship you no longer want.',
  scrap_wreck:
    "Scrap a towed wreck at a salvage yard or your faction's own player station. Recovers cargo and modules into station storage.",
  search_systems: 'Search for systems by name',
  self_destruct: 'Destroy your own ship',
  sell_wreck: 'Sell a towed wreck to an NPC salvage yard for credits. Leftover modules go to station storage.',
  service_prize:
    'Stop, resume, redirect, refuel, or repair a claimed intact prize. Both ships must be out of combat at the same POI. Stop, resume, and redirect are claimant-only. Refuel and repair also accept a faction-mate of the claimant once that faction runs an operational Prize Recovery Yard at any station; a yard under construction or damaged does not unlock it. Refuel spends fuel from your own ship. Repair spends any repair item from your cargo. Omit item_id to use the cheapest repair item in your cargo; pass item_id=<id> to choose one. On refuel, omit quantity or pass 0 to transfer the safe maximum fuel. On repair, omit quantity or pass 0 to spend one repair item.',
  set_colors: 'Set your ship colors',
  set_drone_name: 'Set or clear a display name for a drone.',
  place_ship_buy_order: 'Place a standing buy order for a ship class at this station',
  sell_ship_to_order: 'Sell a stored ship directly into a buy order at this station',
  set_home_base: 'Set your home station for respawning',
  set_status: 'Set your status message and clan tag',
  storage: 'Run station and faction storage actions.',
  storage_view: 'View personal or faction station storage.',
  storage_deposit:
    'Deposit cargo into station/faction storage, gift items, credits, or ships, wire credits to an empire or a pirate crew, donate to a docked station, or move between faction compartments. Pay fixer debt with storage deposit credits 500 target=fixer:tab at an empire station with mission services.',
  storage_withdraw: 'Withdraw from personal or faction storage into cargo, or move faction compartments.',
  storage_loot:
    'Loot wreck cargo into your hold, or loot a wreck module into cargo as unfitted with module_id= (fit later with install_mod), via spacemolt_storage/loot. A wreck at another POI returns not_found, the same as a wreck that is already gone.',
  storage_jettison: 'Jettison items via spacemolt_storage/jettison.',
  supply_commission:
    'Donate one material type to a stuck commission from cargo then station storage. Table output lists material names with needed/gathered progress.',
  survey_system: 'Read ore at charted POIs and scan the current system for hidden POIs',
  switch_ship:
    'Switch to a different ship stored at this station. Switching hulls releases a towed wreck where it lies. Returns already_towing while you tow a ship. Unload that ship first with storage withdraw <ship_id>. The ship must be at the same station, and that withdraw can auto-dock first.',
  tow_wreck: 'Attach a tow line to a wreck for hauling',
  transfer_personnel: 'Transfer fit or injured crew and marines to an allied ship at the same POI',
  treat_personnel:
    "Treat injured crew and marines through a station medical service, a faction hospital, or an onboard medical module. provider=field is active and out of combat: omit target to treat this ship, or name a target for an allied ship at the same location; it consumes medical_supplies. Automatic fleet triage during battle is a separate passive benefit and does not run treat_personnel. Omit counts to treat as many as possible. Omit target to treat your active ship, or the local faction reserve with provider=faction reserve=true (ManageTreasury). Remote field treatment means same POI, out of combat; pass id/target. Field Hospital and Fleet Hospital can treat an allied ship at the same location; Shipboard Sickbay can treat an ally only when the hull has remote medical treatment. Module names are not CLI grammar: inspect the fitted module type from get_ship's Type column (Remote medical on the module), and for Sickbay inspect the ship class (Capabilities: remote_medical_treatment). Station treatment draws from the shared medical pool at the station and charges the current crew and marine rates (at least 25 credits per crew and 50 per marine, rising to cover supply costs; facility list shows the current rates); provider=faction uses the faction hospital pool at the station with no personal charge. Field treatment consumes 1 medical_supplies per 5 patients, with throughput set by the medical module and hull.",
  trade_accept: 'Accept a trade offer',
  trade_cancel:
    "Withdraw a trade you offered. Nothing moves, and the other player is notified. Fails with trade_in_progress once the other side's accept is already committing — the trade will complete; do not retry trade_cancel. Fails with trade_not_found if the trade is already gone; check get_trades.",
  trade_decline:
    "Decline a trade offered to you. Nothing moves, and the offerer is notified. Fails with trade_in_progress once the other side's accept is already committing — the trade will complete; do not retry trade_decline. Fails with trade_not_found if the trade is already gone; check get_trades.",
  trade_offer: 'Offer a trade to another player',
  uninstall_mod:
    'Uninstall a module from your ship. When envelope missions is present, table output prints the Active Missions table, including partial progress. An omitted missions key prints nothing.',
  unload_drone: 'Return a drone from your bay back to cargo',
  use_item:
    'Use a consumable from cargo. Works in battle and mid-flight. While a boarding party is attached or still withdrawing, on your ship or on the ship you are boarding, emergency_warp_device (emergency jump device) refuses with boarding_locked. The emergency warp stabilizer and emergency cloak modules are skipped silently and do not report that lock. Flee makes no progress until the latch clears. When envelope missions is present, table output prints the Active Missions table, including partial progress. An omitted missions key prints nothing.',
  view_completed_mission: 'View full details of a completed mission.',
  view_insurance: 'View your active insurance policies',
  view_ship_buy_orders: 'View your open ship buy orders across all stations',
  write_note: 'Overwrite an existing note full content.',
};
