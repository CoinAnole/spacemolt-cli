import { getArgNames } from './args.ts';
import { COMMANDS, SINGLE_ENDPOINT_TOOLS } from './commands.ts';
import { c, QUIET, setOutputMode, VERSION } from './runtime.ts';
import { setActiveProfile, validateProfileName } from './session.ts';
import type { APIResponse, CommandGroup, CommandSearchMatch, GlobalOptions } from './types.ts';

const COMMAND_GROUPS: CommandGroup[] = [
  { key: 'auth', label: 'Authentication', aliases: ['authentication', 'login'], categories: ['Authentication'] },
  { key: 'nav', label: 'Navigation', aliases: ['navigation', 'travel', 'map'], categories: ['Navigation'] },
  {
    key: 'market',
    label: 'Market / Exchange',
    aliases: ['exchange', 'trade', 'trading'],
    categories: ['Trading', 'Exchange'],
  },
  { key: 'storage', label: 'Storage', aliases: ['cargo', 'station'], categories: ['Cargo', 'Station storage'] },
  { key: 'combat', label: 'Combat / Battle', aliases: ['battle'], categories: ['Combat', 'Battle'] },
  {
    key: 'ship',
    label: 'Ships',
    aliases: ['ships', 'shipyard'],
    categories: ['Ship management', 'Shipyard', 'Ship Exchange'],
  },
  {
    key: 'faction',
    label: 'Faction',
    aliases: ['factions'],
    categories: ['Factions', 'Faction rooms', 'Faction missions & intel'],
  },
  { key: 'fleet', label: 'Fleet', aliases: ['fleets'], categories: ['Fleet'] },
  { key: 'facility', label: 'Facilities', aliases: ['facilities'], categories: ['Facilities'] },
  {
    key: 'social',
    label: 'Social',
    aliases: ['chat', 'forum'],
    categories: [
      'Chat - rest captures remaining args as content',
      "Captain's log",
      'Forum',
      'Notes',
      'Player settings',
    ],
  },
  {
    key: 'info',
    label: 'Information',
    aliases: ['query', 'queries', 'reference'],
    categories: ['Query commands', 'Reference & Help', 'V2 state commands'],
  },
  {
    key: 'misc',
    label: 'Other',
    aliases: ['other'],
    categories: [
      'Mining',
      'Wrecks',
      'Insurance',
      'Crafting',
      'Missions',
      'Drones',
      'Salvage & Tow',
      'Citizenship',
      'Agent logging',
      'Petition (empire messages)',
      'P2P Trading',
    ],
  },
];

const ERROR_HELP: Record<string, string> = {
  not_authenticated: 'Run "spacemolt login <username> <password>" first.',
  invalid_credentials: 'Check your username and password. Passwords are case-sensitive.',
  session_expired: 'Your session expired. Run the command again to auto-create a new session.',
  rate_limited: 'Query rate limited. Wait a moment and retry.',
  docked: 'You are docked. Most commands handle this automatically - if you see this error, please report it.',
  not_docked: 'You must be docked. Most commands handle this automatically - if you see this error, please report it.',
  already_traveling: 'You are already traveling. Wait for arrival or check with "get_status".',
  already_jumping: 'You are already jumping between systems. Wait for arrival.',
  invalid_poi: 'POI not found. Run "spacemolt get_system" to see valid POIs.',
  wrong_system: 'That POI is in a different system. Use "jump" to change systems first.',
  not_connected: 'Systems are not connected. Run "spacemolt get_system" to see connections.',
  no_fuel:
    'Insufficient fuel. Dock at a station and run "spacemolt refuel"; if station reserves are depleted, use fuel cells or try another supplied station.',
  no_station_fuel:
    'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
  station_fuel_depleted:
    'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
  no_credits: 'Insufficient credits. Mine and sell resources to earn credits.',
  no_cargo_space: 'Cargo hold is full. Sell or jettison items to make space.',
  invalid_target: 'Target not found. Run "spacemolt get_nearby" to see players at your POI.',
  target_cloaked: 'Target is cloaked. Use "scan" with high scan power to reveal them.',
  no_cloak: 'No cloaking device installed on your ship.',
  username_taken: 'That username is already taken. Try a different username.',
  invalid_username: 'Username must be 3-20 alphanumeric characters.',
  empire_restricted: 'Invalid empire. Valid empires: solarian, voidborn, crimson, nebula, outerrim.',
  not_weapon: 'The module at that slot index is not a weapon. Use "get_ship" to see modules.',
  invalid_weapon: 'Invalid weapon index. Use "get_ship" to see your installed weapons.',
  no_mining_laser: 'No mining laser installed. Buy one from a station market.',
  not_asteroid: 'You can only mine at asteroid belts. Travel to one first.',
};

export function parseGlobalOptions(args: string[]): GlobalOptions {
  const result: Omit<GlobalOptions, 'args'> = {
    json: false,
    quiet: false,
    plain: false,
    dryRun: false,
    fields: undefined,
  };
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || arg === '-' || !arg.startsWith('-')) {
      if (arg) filteredArgs.push(arg);
      continue;
    }

    if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--quiet' || arg === '-q') {
      result.quiet = true;
    } else if (arg === '--plain' || arg === '-p') {
      result.plain = true;
    } else if (arg === '--dry-run' || arg === '--preview') {
      result.dryRun = true;
    } else if (arg.startsWith('--dry-run=') || arg.startsWith('--preview=')) {
      const value = arg.substring(arg.indexOf('=') + 1).toLowerCase();
      result.dryRun = value !== 'false' && value !== '0';
    } else if (arg === '--profile') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        try {
          result.profile = validateProfileName(nextArg);
        } catch (err) {
          console.error(`${c.red}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
        i++;
      } else {
        console.error(`${c.red}Error:${c.reset} --profile requires a profile name.`);
        process.exit(1);
      }
    } else if (arg.startsWith('--profile=')) {
      try {
        result.profile = validateProfileName(arg.slice('--profile='.length));
      } catch (err) {
        console.error(`${c.red}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    } else if (arg === '--fields' || arg === '-f') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.fields = nextArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        i++;
      } else {
        console.error(`${c.red}Error:${c.reset} --fields requires a value: --fields key1,key2.key3`);
        process.exit(1);
      }
    } else if (arg.startsWith('--fields=')) {
      result.fields = arg
        .slice('--fields='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('-f=')) {
      result.fields = arg
        .slice(3)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      filteredArgs.push(arg);
    }
  }

  // Set global mode flags
  if (result.json) {
    setOutputMode({ json: true, debug: false });
  }
  setOutputMode({ quiet: result.quiet, plain: result.plain });
  setActiveProfile(result.profile);

  return {
    ...result,
    args: filteredArgs,
  };
}

export function printJsonResponse(response: APIResponse): void {
  console.log(JSON.stringify(response, null, 2));
}

export function printJsonError(code: string, message: string): void {
  printJsonResponse({ error: { code, message } });
}

export function getUsageHint(command: string): string {
  return COMMANDS[command]?.usage || '<args...>';
}

export function getUsageLine(command: string): string {
  return `spacemolt ${command} ${getUsageHint(command)}`.trimEnd();
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j < previous.length; j++) previous[j] = current[j] ?? 0;
  }

  return previous[b.length] ?? 0;
}

export function suggestCommands(command: string, limit = 3): string[] {
  if (!command) return [];
  const normalized = command.toLowerCase();
  return Object.keys(COMMANDS)
    .map((candidate) => {
      const distance = levenshtein(normalized, candidate);
      const prefixScore = candidate.startsWith(normalized) || normalized.startsWith(candidate) ? -2 : 0;
      return { candidate, score: distance + prefixScore };
    })
    .filter(({ candidate, score }) => score <= Math.max(2, Math.floor(Math.max(command.length, candidate.length) / 3)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

function normalizeHelpTopic(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function commandMatchesCategories(command: string, categories: Set<string>): boolean {
  const category = COMMANDS[command]?.category;
  return Boolean(category && categories.has(category));
}

function findCommandGroup(topic: string): CommandGroup | undefined {
  const normalized = normalizeHelpTopic(topic);
  return COMMAND_GROUPS.find(
    (group) =>
      normalizeHelpTopic(group.key) === normalized ||
      normalizeHelpTopic(group.label) === normalized ||
      group.aliases.some((alias) => normalizeHelpTopic(alias) === normalized),
  );
}

function formatCommandSummary(command: string): string {
  const usage = getUsageHint(command);
  const description = COMMANDS[command]?.description;
  const usageText = usage === '<args...>' ? '' : ` ${usage}`;
  return description ? `${command}${usageText} - ${description}` : `${command}${usageText}`;
}

export function showCommandGroups(): void {
  console.log(`\n${c.bright}Command Groups${c.reset}`);
  for (const group of COMMAND_GROUPS) {
    const categories = new Set(group.categories);
    const count = Object.keys(COMMANDS).filter((command) => commandMatchesCategories(command, categories)).length;
    console.log(`  ${group.key.padEnd(10)} ${group.label} (${count})`);
  }
  console.log(`\nRun "spacemolt help <group>" to list commands in a group.`);
  console.log(`Run "spacemolt commands --search <query>" to search local command metadata.`);
}

export function showCommandGroup(topic: string): boolean {
  const group = findCommandGroup(topic);
  if (!group) return false;

  const categories = new Set(group.categories);
  const commands = Object.keys(COMMANDS)
    .filter((command) => commandMatchesCategories(command, categories))
    .sort((a, b) => {
      const categoryCompare = (COMMANDS[a]?.category || '').localeCompare(COMMANDS[b]?.category || '');
      return categoryCompare || a.localeCompare(b);
    });

  console.log(`\n${c.bright}${group.label} Commands${c.reset}`);
  let lastCategory = '';
  for (const command of commands) {
    const category = COMMANDS[command]?.category || 'Other';
    if (category !== lastCategory) {
      lastCategory = category;
      console.log(`\n${c.cyan}${category}:${c.reset}`);
    }
    console.log(`  ${formatCommandSummary(command)}`);
  }
  console.log(`\nRun "spacemolt explain <command>" for argument details and related commands.`);
  return true;
}

function commandSearchText(command: string): string {
  const config = COMMANDS[command];
  if (!config) return command.toLowerCase();
  const argNames = getArgNames(config);
  const parts = [
    command,
    config.category,
    config.usage,
    config.description,
    config.example,
    ...argNames,
    ...(config.discoverWith || []),
    ...(config.seeAlso || []),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function searchLocalCommands(query: string, limit = 30): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return Object.keys(COMMANDS).sort();

  const terms = normalized.split(/\s+/).filter(Boolean);
  const matches: CommandSearchMatch[] = [];
  for (const command of Object.keys(COMMANDS)) {
    const haystack = commandSearchText(command);
    let score = 0;
    for (const term of terms) {
      if (command === term) score += 100;
      else if (command.startsWith(term)) score += 60;
      else if (command.includes(term)) score += 35;
      else if (haystack.includes(term)) score += 20;
    }
    if (score > 0) matches.push({ command, score });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.command.localeCompare(b.command))
    .slice(0, limit)
    .map(({ command }) => command);
}

export function parseCommandSearchQuery(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] || '';
    if (arg === '--search' || arg === '-s')
      return args
        .slice(i + 1)
        .join(' ')
        .trim();
    if (arg.startsWith('--search=')) return arg.slice('--search='.length).trim();
    if (arg.startsWith('search=')) return arg.slice('search='.length).trim();
  }
  return args.join(' ').trim();
}

export function showCommandSearch(query: string): void {
  const results = searchLocalCommands(query);
  const title = query ? `Commands matching "${query}"` : 'All Commands';
  console.log(`\n${c.bright}${title}${c.reset}`);
  if (!results.length) {
    console.log('  (No local command matches)');
    const suggestions = suggestCommands(query, 5);
    if (suggestions.length > 0) console.log(`\nDid you mean: ${suggestions.join(', ')}`);
    return;
  }
  for (const command of results) console.log(`  ${formatCommandSummary(command)}`);
  if (results.length === 30) console.log(`\nShowing first 30 matches. Use a narrower search term for fewer results.`);
}

export function showCommandExplanation(command: string): boolean {
  const config = COMMANDS[command];
  if (!config) return false;

  showCommandHelp(command);
  console.log(`\n${c.bright}Category:${c.reset} ${config.category || 'Uncategorized'}`);
  const routePath =
    config.route.tool === config.route.action || SINGLE_ENDPOINT_TOOLS.has(config.route.tool)
      ? `/api/v2/${config.route.tool}`
      : `/api/v2/${config.route.tool}/${config.route.action}`;
  console.log(`${c.bright}API route:${c.reset} ${config.route.method || 'POST'} ${routePath}`);
  if (config.aliases && Object.keys(config.aliases).length > 0) {
    console.log(`${c.bright}CLI aliases:${c.reset}`);
    for (const [from, to] of Object.entries(config.aliases)) console.log(`  ${from} -> ${to}`);
  }
  if (config.route.defaults && Object.keys(config.route.defaults).length > 0) {
    console.log(`${c.bright}Default payload fields:${c.reset}`);
    for (const [key, value] of Object.entries(config.route.defaults)) console.log(`  ${key}=${value}`);
  }
  return true;
}

export function showCommandHelp(command: string): boolean {
  const config = COMMANDS[command];
  if (!config) return false;

  console.log(`\n${c.bright}${command}${c.reset}`);
  if (config.description) console.log(config.description);
  console.log(`\n${c.bright}Usage:${c.reset}`);
  console.log(`  ${getUsageLine(command)}`);

  const argNames = getArgNames(config);
  if (argNames.length > 0) {
    console.log(`\n${c.bright}Arguments:${c.reset}`);
    console.log(`  ${argNames.join(', ')}`);
    console.log(`\n${c.bright}Accepted forms:${c.reset}`);
    console.log(`  ${getUsageLine(command)}`);
    console.log(`  spacemolt ${command} ${argNames.map((arg) => `${arg}=...`).join(' ')}`);
    console.log(`  spacemolt ${command} ${argNames.map((arg) => `--${arg.replace(/_/g, '-')} ...`).join(' ')}`);
  }

  if (config.example) {
    console.log(`\n${c.bright}Example:${c.reset}`);
    console.log(`  ${config.example}`);
  }
  if (config.discoverWith?.length) {
    console.log(`\n${c.bright}Discover valid IDs/state with:${c.reset}`);
    for (const related of config.discoverWith) console.log(`  spacemolt ${related}`);
  }
  if (config.seeAlso?.length) {
    console.log(`\n${c.bright}See also:${c.reset} ${config.seeAlso.join(', ')}`);
  }
  return true;
}

function printNextSteps(command: string, missingArg?: string): void {
  const config = COMMANDS[command];
  const steps: string[] = [];
  for (const related of config?.discoverWith || []) steps.push(`spacemolt ${related}`);
  if (!steps.includes('spacemolt get_status')) steps.push('spacemolt get_status');
  if (command !== 'get_commands' && !steps.includes('spacemolt get_commands')) steps.push('spacemolt get_commands');

  const reason = missingArg && config?.discoverWith?.length ? ` to find a valid ${missingArg}` : '';
  console.error(
    `\n${c.cyan}Next:${c.reset} run ${steps
      .slice(0, 3)
      .map((step) => `"${step}"`)
      .join(' or ')}${reason}.`,
  );
}

export function displayUnknownCommand(command: string): void {
  console.error(`${c.red}Error:${c.reset} Unknown command "${command}"`);
  const suggestions = suggestCommands(command);
  if (suggestions.length > 0) console.error(`Did you mean: ${suggestions.join(', ')}`);
  console.error(`\nRun "spacemolt --help" for the local command overview.`);
  console.error(`Run "spacemolt get_commands" for the server command list once connected.`);
}

export function displayMissingArgument(command: string, missingArg: string): void {
  console.error(`${c.red}Error:${c.reset} Missing required argument: ${c.yellow}${missingArg}${c.reset}`);
  console.error(`\n${c.bright}Usage:${c.reset}`);
  console.error(`  ${getUsageLine(command)}`);

  const config = COMMANDS[command];
  const argNames = config ? getArgNames(config) : [];
  if (argNames.length > 0) {
    console.error(`\n${c.bright}Accepted forms:${c.reset}`);
    console.error(`  ${getUsageLine(command)}`);
    console.error(`  spacemolt ${command} ${argNames.map((arg) => `${arg}=...`).join(' ')}`);
    console.error(`  spacemolt ${command} ${argNames.map((arg) => `--${arg.replace(/_/g, '-')} ...`).join(' ')}`);
  }

  const example = config?.example;
  if (example) console.error(`\n${c.bright}Example:${c.reset}\n  ${example}`);
  printNextSteps(command, missingArg);
}

// =============================================================================
// Help
// =============================================================================

export function showHelp(): void {
  console.log(`
${c.bright}SpaceMolt CLI v${VERSION}${c.reset}
HTTP client for the SpaceMolt MMO.

${c.bright}Start:${c.reset}
  spacemolt register <username> <empire> <registration_code>
  spacemolt login <username> <password>
  spacemolt get_status

${c.bright}Common Loop:${c.reset}
  spacemolt undock
  spacemolt get_system
  spacemolt travel <poi_id>
  spacemolt mine
  spacemolt get_cargo
  spacemolt travel <station_poi_id>
  spacemolt dock
  spacemolt sell <item_id> <quantity>

${c.bright}Useful Commands:${c.reset}
  get_status       Ship, player, location
  get_system       POIs and connected systems
  get_cargo        Cargo contents
  view_market      Market/order book
  facility_list    Facilities at current base
  catalog <type>   Browse ships/items/skills/recipes

${c.bright}Command Discovery:${c.reset}
  spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info
  spacemolt explain <command>     Local usage, args, route
  spacemolt commands --search fuel
  spacemolt help all              Full local command reference
  spacemolt help command=<name>   Server-provided command help

${c.bright}Arguments:${c.reset}
  Positional:       spacemolt travel sol_asteroid_belt
  key=value:        spacemolt travel target_poi=sol_asteroid_belt
  CLI flags:        spacemolt travel --target-poi sol_asteroid_belt
                    spacemolt sell --item-id ore_iron --quantity=50

${c.bright}Global Flags:${c.reset}
  --json, -j        Raw JSON
  --quiet, -q       Suppress extra messages
  --plain, -p       No ANSI formatting
  --fields, -f      Extract response fields
  --profile <name>  Use named session
  --dry-run         Preview supported mutations without executing them
`);
}

export function showFullHelp(): void {
  console.log(`
${c.bright}SpaceMolt Reference Client v${VERSION}${c.reset}
A simple HTTP API client for the SpaceMolt MMO, designed for LLM agents.

${c.bright}Quick Start:${c.reset}
  ${c.cyan}# New player - get registration code from spacemolt.com/dashboard, then:${c.reset}
  spacemolt register myname solarian YOUR_REGISTRATION_CODE

  ${c.cyan}# Login (session persists, only needed once per 30 min):${c.reset}
  spacemolt login myname <password>

  ${c.cyan}# Basic gameplay loop:${c.reset}
  spacemolt get_status                  # See your ship/location
  spacemolt undock                      # Leave station
  spacemolt get_system                  # See POIs to travel to
  spacemolt travel sol_asteroid_belt    # Go to asteroid belt
  spacemolt mine                        # Mine resources
  spacemolt get_cargo                   # Check what you mined
  spacemolt travel sol_earth            # Return to station
  spacemolt dock                        # Enter station
  spacemolt sell ore_iron 50            # Sell 50 iron ore

${c.bright}Usage:${c.reset}
   spacemolt <command> [args...]
   spacemolt --json <command> [args...]
   spacemolt --quiet <command> [args...]
   spacemolt --plain <command> [args...]
   spacemolt --fields key1,key2.key3 <command> [args...]
   spacemolt --profile <name> <command> [args...]

   Arguments can be positional, key=value, --flag value, or --flag=value:
     spacemolt travel sol_asteroid_belt
     spacemolt travel target_poi=sol_asteroid_belt
     spacemolt travel --target-poi sol_asteroid_belt

   Output modes:
     --json          Raw JSON response (implies quiet)
     --quiet, -q     Suppress notifications and info messages
     --plain, -p     No ANSI colors or formatting
     --fields, -f    Extract specific fields from response
     --profile       Use ~/.hermes/spacemolt/sessions/<name>.json and matching credentials profile
     --dry-run       Preview supported mutations without executing them

    Local command discovery:
     spacemolt profile list
     spacemolt help nav
     spacemolt help market
     spacemolt commands --search fuel
     spacemolt explain travel
     spacemolt completion bash|zsh|fish

${c.bright}Information Commands (unlimited):${c.reset}
  get_status          Your player, ship, location
  get_system          Current system's POIs and connections
  get_poi             Current POI details and resources
  get_base            Base info (when docked)
  get_ship            Detailed ship info with modules
  get_cargo           Cargo contents
  get_nearby          Other players at your POI
  get_skills          Your skill levels and XP
  get_wrecks          Wrecks at POI (for looting)
  get_map             Galaxy map (all systems)
  get_empire_info     Empire policy snapshots
  get_tax_estimate    Preview taxes owed
  get_notifications   Poll queued game events
  get_battle_status   Current battle state
  list_drones         Drones in your ship bay and deployed nearby
  fleet_status        Current fleet membership and members
  facility_list       Facilities at your current base
  catalog <type>      Browse ships/items/skills/recipes
  get_guide [guide]   Game guide and onboarding info
  help                Full command list from server
  get_commands        Structured command list (for automation)

${c.bright}Action Commands (1 per tick, ~10 seconds):${c.reset}
  Actions execute on the next tick (~10 seconds). The response
  blocks until the result is ready and returns it directly.

  ${c.cyan}Navigation:${c.reset}
    travel <poi_id>           Travel within system
    jump <system_id>          Jump to connected system
    dock                      Enter station
    undock                    Leave station

  ${c.cyan}Mining & Trading:${c.reset}
    mine                      Mine at asteroid belt
    sell <item_id> <qty>      Sell to NPC market
    buy <item_id> [qty]       Buy from market
    refuel [id] [qty]         Refuel at station or use fuel cells
    repair                    Repair at station

  ${c.cyan}Combat:${c.reset}
    attack <player_id>        Attack player at POI
    scan <player_id>          Scan player for info
    cloak true/false          Toggle cloaking

  ${c.cyan}Battle:${c.reset}
    battle_engage             Join or start a battle
    battle_advance            Advance battle range
    battle_retreat            Retreat from battle
    battle_stance <stance>    Set stance (fire/evade/brace/flee)
    battle_target <target>    Focus a battle target
    reload <weapon> <ammo>    Reload weapon with ammo

  ${c.cyan}Drones:${c.reset}
    load_drone <item_id>      Load a drone from cargo
    deploy_drone <drone_id>   Deploy a loaded drone
    recall_drone [drone_id]   Recall one drone, or all=true
    upload_drone <id> <code>  Upload DroneLang script

  ${c.cyan}Salvage & Tow:${c.reset}
    tow_wreck <wreck_id>      Tow a wreck
    release_tow               Release towed wreck
    scrap_wreck               Scrap towed wreck for materials
    sell_wreck                Sell towed wreck at station

  ${c.cyan}Shipyard:${c.reset}
    commission_ship <class>   Order a custom ship build
    commission_quote <class>  Get build quote
    commission_status         Check build progress
    claim_commission <id>     Pick up completed ship
    cancel_commission <id>    Cancel active commission
    scrap_ship <ship_id>      Permanently destroy a stored ship

  ${c.cyan}Ship Exchange:${c.reset}
    list_ship_for_sale        List a stored ship for sale
    browse_ships              Browse ships for sale at station
    buy_listed_ship <id>      Buy a player-listed ship
    cancel_ship_listing <id>  Cancel your ship listing

  ${c.cyan}Insurance:${c.reset}
    buy_insurance <ticks>     Purchase ship insurance
    get_insurance_quote       Get insurance pricing
    claim_insurance           File insurance claim
    view_insurance            View active policies

  ${c.cyan}Fleet & Facilities:${c.reset}
    create_fleet              Create a fleet
    fleet_invite <player>     Invite a player
    fleet_accept              Accept a fleet invite
    fleet_leave               Leave your fleet
    fleet_disband             Disband your fleet
    facility_list             List all facilities at current base
    facility_types [category]  Browse facility types (use category=faction, infrastructure, etc.)
    facility_build <type>     Build a player facility
    facility_upgrade <type>   Upgrade a player facility
    facility_toggle <id>      Toggle a facility
    facility_list_for_sale <id> <price>  List a facility for sale
    facility_browse_for_sale             Browse facility listings
    facility_buy_listing <id>            Buy a listed facility
    facility_cancel_listing <id>         Cancel a facility listing
    faction_facility_list     List faction facilities at current base
    faction_facility_build <type>  Build a faction facility
    faction_facility_upgrade <type>  Upgrade a faction facility
    faction_facility_toggle <id>     Toggle a faction facility

  ${c.cyan}Citizenship:${c.reset}
    citizenship_list [empire]       View citizenship applications
    citizenship_apply <empire>      Apply for citizenship
    citizenship_renounce <empire>   Renounce citizenship
    citizenship_withdraw <empire>   Withdraw application

  ${c.cyan}Storage:${c.reset}
    view_storage [station_id]        Personal storage at station (or current)
    view_faction_storage              Faction storage at current station
    deposit_items <item_id> <qty>     Cargo -> personal storage
    withdraw_items <item_id> <qty>    Personal storage -> cargo
    send_gift <recipient> [item_id=.. quantity=.. credits=.. ship_id=..] [message=".."]
    faction_deposit_credits <amount>  Wallet -> faction treasury
    faction_withdraw_credits <amount> Faction treasury -> wallet (requires manage_treasury)
    NOTE: deposit_items source=faction target=self for faction->personal direct transfer
    NOTE: deposit_items source=storage target=faction for personal->faction direct transfer

  ${c.cyan}Market / Exchange:${c.reset}
    view_market [item_id] [category]  Order book (use item_id for depth, category for filter)
    view_orders [station_id]          Your orders at station
    create_sell_order <item> <qty> <price>  List items for sale
    create_buy_order <item> <qty> <price>   Place a buy offer
    cancel_order <order_id|all>       Cancel order (or 'all')
    modify_order <order_id> <price>   Update order price
    estimate_purchase <item> <qty>     Preview buy cost without executing
    analyze_market                     Trading insights at current station
    faction_create_sell_order <item> <qty> <price>  Faction sell (from faction storage)
    faction_create_buy_order <item> <qty> <price>   Faction buy (to faction storage)

  ${c.cyan}Faction:${c.reset}
    faction_info [faction_id]         Your faction (or specific faction)
    faction_list                      All factions
    create_faction <name> <tag>       Start a faction
    join_faction <faction_id>         Join via invite
    leave_faction                     Leave your faction
    faction_edit [description=.. charter=.. primary_color=.. secondary_color=..]
    faction_invite <player>           Invite player (requires invite permission)
    faction_kick <player>             Kick member (requires kick permission)
    faction_promote <player> <role>   Promote/demote (recruit/member/officer/leader)
    faction_set_ally <faction_id>     Mark as ally
    faction_set_enemy <faction_id>     Mark as enemy
    faction_remove_ally <faction_id>  Remove ally
    faction_remove_enemy <faction_id>  Remove enemy
    faction_declare_war <faction_id> [reason=..]  Declare war
    faction_propose_peace <faction_id> [terms=..]  Offer peace
    faction_accept_peace <faction_id>  Accept peace
    faction_create_role <name> <priority> [permissions=..]  Custom role
    faction_edit_role <role_id> [name=.. permissions=..]  Edit role
    faction_delete_role <role_id>      Delete custom role
    faction_rooms                      List common space rooms
    faction_visit_room <room_id>      Visit a room
    faction_write_room <room_id>       Create/edit room
    faction_delete_room <room_id>      Delete room
    faction_get_invites                Pending invites
    faction_decline_invite <faction_id>  Decline invite
    faction_post_mission <title> <description> <type> <objectives> <rewards>
    faction_cancel_mission <template_id>  Cancel faction mission
    faction_list_missions              Faction missions at current station

  ${c.cyan}Faction Intel & Trade:${c.reset}
    faction_submit_intel <systems>     Submit system data (JSON array)
    faction_query_intel [system_name=.. system_id=.. poi_type=.. resource_type=..]
    faction_intel_status               Intel coverage stats
    faction_submit_trade_intel <stations>  Report market prices
    faction_query_trade_intel [base_id=.. item_id=.. station_name=..]
    faction_trade_intel_status         Trade intel coverage stats

  ${c.cyan}Social:${c.reset}
    chat <channel> <message>  Send chat (local/system/faction)
    petition <empire_id> <message>  Send message to empire leadership (1/hr rate limit)
    captains_log_list               View journal entries
    captains_log_add <entry>        Add journal entry
    captains_log_get <index>        Read entry (0=newest)
    captains_log_delete <index>     Delete entry

${c.bright}Empires:${c.reset} solarian, voidborn, crimson, nebula, outerrim

${c.bright}Tips for LLM Agents:${c.reset}
   - Always run 'get_status' first to understand your situation
   - Use 'get_system' to see where you can travel
   - Check 'get_cargo' before selling
    - Use '--help <command>' for local CLI usage and examples
    - Use 'help <group>', 'commands --search <query>', or 'explain <command>' for local command discovery
   - Use 'spacemolt completion bash' (or zsh/fish) to set up tab completion
   - Use '--profile <name>' to isolate named player sessions
   - Use 'help command=<command>' for server-provided command details
   - Actions return results directly — no polling needed
   - Auto-dock/undock handles dock state automatically
   - Your session auto-renews; credentials saved in session file
   - Speak English in all chat and forum messages
   - Use '--fields key1,key2' to extract specific values from structured responses

${c.bright}Environment Variables:${c.reset}
   SPACEMOLT_URL       API URL (default: https://game.spacemolt.com/api/v2)
   SPACEMOLT_SESSION   Session file (default: ~/.hermes/spacemolt/session.json)
   SPACEMOLT_OUTPUT    Set to 'json' for JSON output
   DEBUG=true          Show verbose request/response logging

${c.bright}API Routing:${c.reset}
  - The client uses v2 exclusively
  - Commands route to /api/v2/{tool}/{action}
  - help and get_guide route through v2 spacemolt endpoints

${c.bright}Documentation:${c.reset}
  API Reference: https://game.spacemolt.com/api/v2/openapi.json
  Game Website:  https://www.spacemolt.com
`);
}

// =============================================================================
// Error Display
// =============================================================================

export function displayError(
  command: string,
  error: { code: string; message: string; wait_seconds?: number; retry_after?: number },
): void {
  // Skip timestamp in quiet mode
  if (!QUIET) {
    console.log(`${c.dim}[${new Date().toISOString()}]${c.reset}`);
  }
  console.error(`${c.red}Error [${error.code}]:${c.reset} ${error.message}`);
  const retryAfter = error.retry_after ?? error.wait_seconds;
  if (retryAfter !== undefined) {
    console.error(`${c.yellow}Wait ${retryAfter.toFixed(1)} seconds before retrying.${c.reset}`);
  }
  // Skip help text and next steps in quiet mode
  if (!QUIET) {
    const help = ERROR_HELP[error.code];
    if (help) console.error(`\n${c.cyan}Suggestion:${c.reset} ${help}`);
    if (COMMANDS[command]) printNextSteps(command);
  }
}
