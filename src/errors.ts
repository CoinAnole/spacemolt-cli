export interface ErrorCodeEntry {
  code: string;
  message: string;
  suggestion: string;
  retryable: boolean;
  auth: boolean;
  relatedCommands: string[];
}

export const ERROR_REGISTRY: Record<string, ErrorCodeEntry> = {
  not_authenticated: {
    code: 'not_authenticated',
    message: 'Authentication required.',
    suggestion: 'Run "spacemolt login <username> <password>" first.',
    retryable: true,
    auth: true,
    relatedCommands: ['login', 'register'],
  },
  invalid_credentials: {
    code: 'invalid_credentials',
    message: 'Invalid username or password.',
    suggestion: 'Check your username and password. Passwords are case-sensitive.',
    retryable: true,
    auth: true,
    relatedCommands: ['login'],
  },
  session_expired: {
    code: 'session_expired',
    message: 'Session expired.',
    suggestion: 'Your session expired. Run the command again to auto-create a new session.',
    retryable: true,
    auth: true,
    relatedCommands: ['login', 'get_status'],
  },
  session_invalid: {
    code: 'session_invalid',
    message: 'Session is invalid.',
    suggestion: 'Run "spacemolt login <username> <password>" to re-authenticate.',
    retryable: true,
    auth: true,
    relatedCommands: ['login'],
  },
  invalid_session: {
    code: 'invalid_session',
    message: 'Session is invalid.',
    suggestion: 'Run "spacemolt login <username> <password>" to re-authenticate.',
    retryable: true,
    auth: true,
    relatedCommands: ['login'],
  },
  rate_limited: {
    code: 'rate_limited',
    message: 'Rate limited.',
    suggestion: 'Query rate limited. Wait a moment and retry.',
    retryable: true,
    auth: false,
    relatedCommands: [],
  },
  persist_failed: {
    code: 'persist_failed',
    message: 'Persistence confirmation failed.',
    suggestion: 'Verify your state with "spacemolt get_status" before retrying the transaction.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  persist_timeout: {
    code: 'persist_timeout',
    message: 'Persistence confirmation timed out.',
    suggestion: 'Verify your state with "spacemolt get_status" before retrying the transaction.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  invalid_payload: {
    code: 'invalid_payload',
    message: 'Invalid command payload.',
    suggestion:
      'Check parameter names and spelling. Run "spacemolt help <command>" for local command arguments, or "spacemolt get_commands" for the server command list.',
    retryable: false,
    auth: false,
    relatedCommands: ['help', 'get_commands'],
  },
  docked: {
    code: 'docked',
    message: 'Ship is docked.',
    suggestion: 'You are docked. Most commands handle this automatically - if you see this error, please report it.',
    retryable: false,
    auth: false,
    relatedCommands: ['undock', 'get_status'],
  },
  not_docked: {
    code: 'not_docked',
    message: 'Ship is not docked.',
    suggestion:
      'You must be docked. Most commands handle this automatically - if you see this error, please report it.',
    retryable: false,
    auth: false,
    relatedCommands: ['dock', 'get_status'],
  },
  already_traveling: {
    code: 'already_traveling',
    message: 'Already traveling.',
    suggestion: 'You are already traveling. Wait for arrival or check with "get_status".',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  already_jumping: {
    code: 'already_jumping',
    message: 'Already jumping.',
    suggestion: 'You are already jumping between systems. Wait for arrival.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  in_transit: {
    code: 'in_transit',
    message: 'Ship is in transit.',
    suggestion: 'Wait for arrival, then rerun the command. Use "spacemolt get_status" to check movement progress.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  fleet_moved: {
    code: 'fleet_moved',
    message: 'Fleet moved.',
    suggestion: 'Your fleet moved while the command was pending. Run "spacemolt get_status" before retrying.',
    retryable: true,
    auth: false,
    relatedCommands: ['get_status'],
  },
  invalid_poi: {
    code: 'invalid_poi',
    message: 'Invalid POI.',
    suggestion: 'POI not found. Run "spacemolt get_system" to see valid POIs.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system'],
  },
  wrong_system: {
    code: 'wrong_system',
    message: 'POI is in a different system.',
    suggestion: 'That POI is in a different system. Use "jump" to change systems first.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'jump'],
  },
  not_connected: {
    code: 'not_connected',
    message: 'Systems are not connected.',
    suggestion: 'Systems are not connected. Run "spacemolt get_system" to see connections.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'jump'],
  },
  no_fuel: {
    code: 'no_fuel',
    message: 'Insufficient fuel.',
    suggestion:
      'Insufficient fuel. Dock at a station and run "spacemolt refuel"; if station reserves are depleted, use fuel cells or try another supplied station.',
    retryable: true,
    auth: false,
    relatedCommands: ['refuel', 'dock', 'get_status'],
  },
  no_station_fuel: {
    code: 'no_station_fuel',
    message: 'Station has no fuel.',
    suggestion:
      'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
    retryable: true,
    auth: false,
    relatedCommands: ['refuel', 'get_system'],
  },
  station_fuel_depleted: {
    code: 'station_fuel_depleted',
    message: 'Station fuel depleted.',
    suggestion:
      'This station has insufficient fuel reserves. Try another supplied station, haul fuel here, or use fuel cells.',
    retryable: true,
    auth: false,
    relatedCommands: ['refuel', 'get_system'],
  },
  no_credits: {
    code: 'no_credits',
    message: 'Insufficient credits.',
    suggestion: 'Insufficient credits. Mine and sell resources to earn credits.',
    retryable: true,
    auth: false,
    relatedCommands: ['mine', 'sell', 'get_cargo'],
  },
  no_cargo_space: {
    code: 'no_cargo_space',
    message: 'Cargo hold is full.',
    suggestion: 'Cargo hold is full. Sell or jettison items to make space.',
    retryable: true,
    auth: false,
    relatedCommands: ['sell', 'get_cargo'],
  },
  invalid_target: {
    code: 'invalid_target',
    message: 'Invalid target.',
    suggestion: 'Target not found. Run "spacemolt get_nearby" to see players at your POI.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_nearby'],
  },
  target_cloaked: {
    code: 'target_cloaked',
    message: 'Target is cloaked.',
    suggestion: 'Target is cloaked. Use "scan" with high scan power to reveal them.',
    retryable: true,
    auth: false,
    relatedCommands: ['scan'],
  },
  no_cloak: {
    code: 'no_cloak',
    message: 'No cloaking device.',
    suggestion: 'No cloaking device installed on your ship.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship'],
  },
  username_taken: {
    code: 'username_taken',
    message: 'Username is taken.',
    suggestion: 'That username is already taken. Try a different username.',
    retryable: true,
    auth: false,
    relatedCommands: ['register'],
  },
  invalid_username: {
    code: 'invalid_username',
    message: 'Invalid username.',
    suggestion: 'Username must be 3-20 alphanumeric characters.',
    retryable: true,
    auth: false,
    relatedCommands: ['register'],
  },
  empire_restricted: {
    code: 'empire_restricted',
    message: 'Invalid empire.',
    suggestion: 'Invalid empire. Valid empires: solarian, voidborn, crimson, nebula, outerrim.',
    retryable: true,
    auth: false,
    relatedCommands: ['register'],
  },
  not_weapon: {
    code: 'not_weapon',
    message: 'Module is not a weapon.',
    suggestion: 'The module at that slot index is not a weapon. Use "get_ship" to see modules.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship'],
  },
  invalid_weapon: {
    code: 'invalid_weapon',
    message: 'Invalid weapon index.',
    suggestion: 'Invalid weapon index. Use "get_ship" to see your installed weapons.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship'],
  },
  no_mining_laser: {
    code: 'no_mining_laser',
    message: 'No mining laser installed.',
    suggestion: 'No mining laser installed. Buy one from a station market.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_ship', 'view_market'],
  },
  not_asteroid: {
    code: 'not_asteroid',
    message: 'Not at an asteroid belt.',
    suggestion: 'You can only mine at asteroid belts. Travel to one first.',
    retryable: false,
    auth: false,
    relatedCommands: ['get_system', 'travel'],
  },
};

export const ERROR_CODES = Object.keys(ERROR_REGISTRY);

export function isKnownErrorCode(code: string): code is keyof typeof ERROR_REGISTRY {
  return code in ERROR_REGISTRY;
}

export function isRetryableError(code: string): boolean {
  return ERROR_REGISTRY[code]?.retryable ?? true;
}

export function isAuthError(code: string): boolean {
  return ERROR_REGISTRY[code]?.auth ?? false;
}

export function getErrorSuggestion(code: string): string | undefined {
  return ERROR_REGISTRY[code]?.suggestion;
}

export function getRelatedCommands(code: string): string[] {
  return ERROR_REGISTRY[code]?.relatedCommands ?? [];
}
