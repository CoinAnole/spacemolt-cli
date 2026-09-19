import { describe, expect, test } from 'bun:test';
import {
  ERROR_CODES,
  ERROR_REGISTRY,
  getErrorSuggestion,
  getRelatedCommands,
  isAuthError,
  isKnownErrorCode,
  isRetryableError,
  ServiceUnavailableError,
} from './errors.ts';

describe('service_unavailable', () => {
  test('is retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.service_unavailable?.retryable).toBe(true);
    expect(ERROR_REGISTRY.service_unavailable?.auth).toBe(false);
    expect(isRetryableError('service_unavailable')).toBe(true);
    expect(isAuthError('service_unavailable')).toBe(false);
  });

  test('ServiceUnavailableError maps to an APIResponse error payload', () => {
    const error = new ServiceUnavailableError('provider down', 8);
    expect(error.code).toBe('service_unavailable');
    expect(error.retryAfter).toBe(8);
    expect(error.toAPIResponse()).toEqual({
      error: { code: 'service_unavailable', message: 'provider down', retry_after: 8 },
    });
  });
});

describe('arena trial errors', () => {
  test('challenge_locked is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.challenge_locked?.retryable).toBe(false);
    expect(ERROR_REGISTRY.challenge_locked?.auth).toBe(false);
    expect(isRetryableError('challenge_locked')).toBe(false);
    expect(isAuthError('challenge_locked')).toBe(false);
    expect(getErrorSuggestion('challenge_locked')).toContain('spacemolt arena challenges');
    expect(getErrorSuggestion('challenge_locked')).not.toContain('arena_challenges');
    expect(getRelatedCommands('challenge_locked')).toEqual(['arena_challenges', 'arena_fight']);
  });

  test('arena_rule is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.arena_rule?.retryable).toBe(false);
    expect(ERROR_REGISTRY.arena_rule?.auth).toBe(false);
    expect(isRetryableError('arena_rule')).toBe(false);
    expect(isAuthError('arena_rule')).toBe(false);
    expect(getErrorSuggestion('arena_rule')).toContain('spacemolt arena challenges');
    expect(getErrorSuggestion('arena_rule')).not.toContain('arena_challenges');
    expect(getRelatedCommands('arena_rule')).toEqual(['arena_challenges', 'use_item']);
  });

  test('rule_hull_tier is unregistered, non-retryable, and suggests arena challenges', () => {
    expect(ERROR_REGISTRY.rule_hull_tier).toBeUndefined();
    expect(isKnownErrorCode('rule_hull_tier')).toBe(false);
    expect(ERROR_CODES).not.toContain('rule_hull_tier');
    expect(isRetryableError('rule_hull_tier')).toBe(false);
    expect(isAuthError('rule_hull_tier')).toBe(false);
    expect(getErrorSuggestion('rule_hull_tier')).toContain('spacemolt arena challenges');
    expect(getErrorSuggestion('rule_hull_tier')).toContain('spacemolt arena fight');
    expect(getErrorSuggestion('rule_hull_tier')).toContain('loadout');
    expect(getErrorSuggestion('rule_hull_tier')).not.toContain('arena_challenges');
    expect(getRelatedCommands('rule_hull_tier')).toEqual(['arena_challenges', 'arena_fight']);
  });

  test('rule_no_drones uses the same fight-start family fallback', () => {
    expect(ERROR_REGISTRY.rule_no_drones).toBeUndefined();
    expect(isKnownErrorCode('rule_no_drones')).toBe(false);
    expect(ERROR_CODES).not.toContain('rule_no_drones');
    expect(isRetryableError('rule_no_drones')).toBe(false);
    expect(isAuthError('rule_no_drones')).toBe(false);
    expect(getErrorSuggestion('rule_no_drones')).toContain('spacemolt arena challenges');
    expect(getErrorSuggestion('rule_no_drones')).toContain('spacemolt arena fight');
    expect(getErrorSuggestion('rule_no_drones')).toContain('loadout');
    expect(getErrorSuggestion('rule_no_drones')).not.toContain('arena_challenges');
    expect(getRelatedCommands('rule_no_drones')).toEqual(['arena_challenges', 'arena_fight']);
  });

  test('rule_* matcher negatives stay unknown and retryable', () => {
    for (const code of ['rule', 'rule_', 'ruled_out', 'Rule_hull_tier']) {
      expect(ERROR_REGISTRY[code]).toBeUndefined();
      expect(isKnownErrorCode(code)).toBe(false);
      expect(isRetryableError(code)).toBe(true);
      expect(isAuthError(code)).toBe(false);
      expect(getErrorSuggestion(code)).toBeUndefined();
      expect(getRelatedCommands(code)).toEqual([]);
    }
  });
});

describe('deposit_too_sparse', () => {
  test('is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.deposit_too_sparse?.retryable).toBe(false);
    expect(ERROR_REGISTRY.deposit_too_sparse?.auth).toBe(false);
    expect(isRetryableError('deposit_too_sparse')).toBe(false);
    expect(isAuthError('deposit_too_sparse')).toBe(false);
    expect(getErrorSuggestion('deposit_too_sparse')).toContain('spacemolt get_poi');
    expect(getErrorSuggestion('deposit_too_sparse')).toContain('spacemolt uninstall_mod');
    expect(getRelatedCommands('deposit_too_sparse')).toEqual(['get_poi', 'get_ship', 'uninstall_mod', 'install_mod']);
  });
});

describe('rate_limited', () => {
  test('suggestion names session 30/300 limits and is not query-only', () => {
    expect(ERROR_REGISTRY.rate_limited?.retryable).toBe(true);
    expect(ERROR_REGISTRY.rate_limited?.auth).toBe(false);
    expect(isRetryableError('rate_limited')).toBe(true);
    expect(isAuthError('rate_limited')).toBe(false);
    expect(getErrorSuggestion('rate_limited')).toContain('30');
    expect(getErrorSuggestion('rate_limited')).toContain('300');
    expect(getErrorSuggestion('rate_limited')).not.toContain('Query rate limited');
  });
});

describe('action_pending', () => {
  test('is retryable, related to get_status, and forbids immediate resubmit', () => {
    expect(ERROR_REGISTRY.action_pending?.retryable).toBe(true);
    expect(ERROR_REGISTRY.action_pending?.auth).toBe(false);
    expect(isRetryableError('action_pending')).toBe(true);
    expect(isAuthError('action_pending')).toBe(false);
    expect(isKnownErrorCode('action_pending')).toBe(true);
    expect(ERROR_CODES).toContain('action_pending');
    expect(getRelatedCommands('action_pending')).toEqual(['get_status']);
    expect(getErrorSuggestion('action_pending')).toContain('Do not resubmit immediately');
  });
});

describe('ip_timed_out', () => {
  test('is not retryable, is not an authentication error, and tells the user to stop', () => {
    expect(ERROR_REGISTRY.ip_timed_out?.retryable).toBe(false);
    expect(ERROR_REGISTRY.ip_timed_out?.auth).toBe(false);
    expect(isRetryableError('ip_timed_out')).toBe(false);
    expect(isAuthError('ip_timed_out')).toBe(false);
    expect(isKnownErrorCode('ip_timed_out')).toBe(true);
    expect(ERROR_CODES).toContain('ip_timed_out');
    expect(getErrorSuggestion('ip_timed_out')).toContain('retry_after');
    expect(getErrorSuggestion('ip_timed_out')).toContain('do not keep retrying');
    expect(getErrorSuggestion('ip_timed_out')).not.toContain('Wait for the time in the error message');
    expect(getRelatedCommands('ip_timed_out')).toEqual([]);
  });
});

describe('station_under_attack', () => {
  test('is retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.station_under_attack?.retryable).toBe(true);
    expect(ERROR_REGISTRY.station_under_attack?.auth).toBe(false);
    expect(isRetryableError('station_under_attack')).toBe(true);
    expect(isAuthError('station_under_attack')).toBe(false);
    expect(isKnownErrorCode('station_under_attack')).toBe(true);
    expect(ERROR_CODES).toContain('station_under_attack');
    expect(getErrorSuggestion('station_under_attack')).toContain('spacemolt get_status');
    expect(getErrorSuggestion('station_under_attack')).toContain('faction-mate');
    expect(getErrorSuggestion('station_under_attack')).toContain('same command');
    expect(getErrorSuggestion('station_under_attack')).toMatch(/wait|blast doors/i);
    expect(getErrorSuggestion('station_under_attack')).not.toContain('retry dock');
    expect(getRelatedCommands('station_under_attack')).toEqual(['get_status', 'dock']);
  });
});

describe('fit capacity errors', () => {
  test('cpu_exceeded is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.cpu_exceeded?.retryable).toBe(false);
    expect(ERROR_REGISTRY.cpu_exceeded?.auth).toBe(false);
    expect(isRetryableError('cpu_exceeded')).toBe(false);
    expect(isAuthError('cpu_exceeded')).toBe(false);
    expect(getErrorSuggestion('cpu_exceeded')).toContain('spacemolt get_ship');
    expect(getErrorSuggestion('cpu_exceeded')).toContain('spacemolt uninstall_mod');
    expect(getRelatedCommands('cpu_exceeded')).toEqual(['get_ship', 'uninstall_mod', 'install_mod']);
  });

  test('power_exceeded is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.power_exceeded?.retryable).toBe(false);
    expect(ERROR_REGISTRY.power_exceeded?.auth).toBe(false);
    expect(isRetryableError('power_exceeded')).toBe(false);
    expect(isAuthError('power_exceeded')).toBe(false);
    expect(getErrorSuggestion('power_exceeded')).toContain('spacemolt get_ship');
    expect(getErrorSuggestion('power_exceeded')).toContain('spacemolt uninstall_mod');
    expect(getRelatedCommands('power_exceeded')).toEqual(['get_ship', 'uninstall_mod', 'install_mod']);
  });

  test('cargo_capacity_exceeded is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.cargo_capacity_exceeded?.retryable).toBe(false);
    expect(ERROR_REGISTRY.cargo_capacity_exceeded?.auth).toBe(false);
    expect(isRetryableError('cargo_capacity_exceeded')).toBe(false);
    expect(isAuthError('cargo_capacity_exceeded')).toBe(false);
    expect(getErrorSuggestion('cargo_capacity_exceeded')).toContain('spacemolt get_ship');
    expect(getErrorSuggestion('cargo_capacity_exceeded')).toContain('spacemolt uninstall_mod');
    expect(getErrorSuggestion('cargo_capacity_exceeded')).toContain('spacemolt install_mod');
    expect(getErrorSuggestion('cargo_capacity_exceeded')).not.toContain('loot_wreck');
    expect(getErrorSuggestion('cargo_capacity_exceeded')).not.toContain('storage_loot');
    expect(getRelatedCommands('cargo_capacity_exceeded')).toEqual(['get_ship', 'uninstall_mod', 'install_mod']);
  });

  test('cargo_full is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.cargo_full?.retryable).toBe(false);
    expect(ERROR_REGISTRY.cargo_full?.auth).toBe(false);
    expect(isRetryableError('cargo_full')).toBe(false);
    expect(isAuthError('cargo_full')).toBe(false);
    expect(getErrorSuggestion('cargo_full')).toContain('spacemolt get_ship');
    expect(getErrorSuggestion('cargo_full')).toContain('spacemolt sell');
    expect(getErrorSuggestion('cargo_full')).toContain('spacemolt jettison');
    expect(getErrorSuggestion('cargo_full')).toContain('spacemolt buy');
    expect(getErrorSuggestion('cargo_full')).toContain('delivery=storage');
    expect(getErrorSuggestion('cargo_full')).not.toContain('storage_loot');
    expect(getErrorSuggestion('cargo_full')).not.toContain('deliver_to');
    expect(getRelatedCommands('cargo_full')).toEqual(['get_ship', 'sell', 'jettison', 'buy', 'uninstall_mod']);
  });

  test('no_space is not retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.no_space?.retryable).toBe(false);
    expect(ERROR_REGISTRY.no_space?.auth).toBe(false);
    expect(isRetryableError('no_space')).toBe(false);
    expect(isAuthError('no_space')).toBe(false);
    expect(getErrorSuggestion('no_space')).toContain('untouched');
    expect(getErrorSuggestion('no_space')).toContain('loot_wreck');
    expect(getErrorSuggestion('no_space')).toContain('install_mod');
    expect(getErrorSuggestion('no_space')).toContain('get_ship');
    expect(getErrorSuggestion('no_space')).not.toContain('storage_loot');
    expect(getErrorSuggestion('no_space')).not.toContain('delivery=storage');
    expect(getRelatedCommands('no_space')).toEqual(['get_ship', 'sell', 'jettison', 'loot_wreck', 'install_mod']);
  });
});

describe('boarding_locked', () => {
  test('is retryable and is not an authentication error', () => {
    expect(ERROR_REGISTRY.boarding_locked?.retryable).toBe(true);
    expect(ERROR_REGISTRY.boarding_locked?.auth).toBe(false);
    expect(isRetryableError('boarding_locked')).toBe(true);
    expect(isAuthError('boarding_locked')).toBe(false);
    expect(isKnownErrorCode('boarding_locked')).toBe(true);
    expect(ERROR_CODES).toContain('boarding_locked');
    expect(getErrorSuggestion('boarding_locked')).toContain('emergency_warp_device');
    expect(getErrorSuggestion('boarding_locked')).toContain('spacemolt get_battle_status');
    expect(getErrorSuggestion('boarding_locked')).toContain('spacemolt battle_stance fire');
    expect(getErrorSuggestion('boarding_locked')).toContain('spacemolt use_item');
    expect(getErrorSuggestion('boarding_locked')).toMatch(/latch clears|wait/i);
    expect(getErrorSuggestion('boarding_locked')).toMatch(/Flee makes no progress/);
    expect(getErrorSuggestion('boarding_locked')).not.toContain('spacemolt flee');
    expect(getErrorSuggestion('boarding_locked')).not.toMatch(/retry .*flee|flee as a workaround/i);
    expect(getErrorSuggestion('boarding_locked')).not.toContain('closing_stalled');
    expect(getRelatedCommands('boarding_locked')).toEqual(['get_battle_status', 'battle_stance', 'use_item']);
  });
});

describe('insufficient_credits', () => {
  test('is retryable, is not an authentication error, and has command overlays', () => {
    expect(ERROR_REGISTRY.insufficient_credits?.retryable).toBe(true);
    expect(ERROR_REGISTRY.insufficient_credits?.auth).toBe(false);
    expect(isRetryableError('insufficient_credits')).toBe(true);
    expect(isAuthError('insufficient_credits')).toBe(false);
    expect(isKnownErrorCode('insufficient_credits')).toBe(true);
    expect(ERROR_CODES).toContain('insufficient_credits');
    expect(ERROR_REGISTRY.insufficient_credits?.message).toBe('Not enough credits for this action.');
    expect(ERROR_REGISTRY.no_credits?.message).toBe('Insufficient credits.');
    expect(Object.keys(ERROR_REGISTRY.insufficient_credits?.commandSuggestions ?? {})).toEqual([
      'craft',
      'faction_declare_war',
      'citizenship_apply',
    ]);
    expect(ERROR_REGISTRY.no_credits?.commandSuggestions).toBeUndefined();
    expect(ERROR_REGISTRY.boarding_locked?.commandSuggestions).toBeUndefined();
  });

  test('generic suggestion is wallet-agnostic and does not invent a craft or war story', () => {
    const suggestion = getErrorSuggestion('insufficient_credits');
    expect(suggestion).toContain('Check the server message');
    expect(suggestion).toContain('spacemolt get_status');
    expect(suggestion).toContain('If the server message names the faction treasury');
    expect(suggestion).toContain('spacemolt faction_deposit_credits');
    expect(suggestion).toContain('missing_materials');
    expect(suggestion).toContain('missing_faction_materials');
    expect(suggestion).not.toContain('dry_run');
    expect(suggestion).not.toContain('recipe inputs');
    expect(suggestion).not.toContain('job stayed');
    expect(suggestion).not.toContain('already held');
    expect(suggestion).not.toContain('spacemolt storage deposit');
    expect(suggestion).not.toContain('The server message names which wallet');
    expect(suggestion).not.toContain('50,000');
    expect(suggestion).not.toContain('50000');
  });

  test('craft overlay treats a credit miss as labor or rental, not materials', () => {
    const suggestion = getErrorSuggestion('insufficient_credits', 'craft');
    expect(suggestion).toContain('labor');
    expect(suggestion).toContain('rental');
    expect(suggestion).toContain('missing_materials');
    expect(suggestion).toContain('missing_faction_materials');
    expect(suggestion).toContain('Do not deposit items');
    expect(suggestion).toContain('If the server message names the faction treasury');
    expect(suggestion).toContain('spacemolt faction_deposit_credits');
    expect(suggestion).toContain('spacemolt get_status');
    expect(suggestion).toContain('dry_run=true');
    expect(suggestion).toContain('preset=cheap');
    expect(suggestion).toContain('preset=prefer_own');
    expect(suggestion).toContain('still rents');
    expect(suggestion).not.toContain('already held');
    expect(suggestion).not.toContain('job stayed');
    expect(suggestion).not.toContain('spacemolt storage deposit');
    expect(suggestion).not.toMatch(/retry .*storage deposit|deposit .*to faction storage/i);
    expect(suggestion).not.toContain('50,000');
    expect(suggestion).not.toContain('50000');
  });

  test('war overlay uses the player wallet for grouped and underscore names', () => {
    const underscore = getErrorSuggestion('insufficient_credits', 'faction_declare_war');
    const grouped = getErrorSuggestion('insufficient_credits', 'faction declare_war');
    expect(underscore).toBe(grouped);
    expect(underscore).toContain('50,000');
    expect(underscore).toContain('wallet');
    expect(underscore).toContain('spacemolt get_status');
    expect(underscore).toContain('Do not run "spacemolt faction_deposit_credits"');
    expect(underscore).not.toContain('If the server message names the faction treasury');
    expect(underscore).not.toContain('dry_run');
    expect(underscore).not.toContain('labor');
    expect(underscore).not.toContain('missing_materials');
    expect(underscore).not.toContain('already held');
    expect(underscore).not.toContain('job stayed');
  });

  test('citizenship overlay uses the player wallet for grouped and underscore names', () => {
    const underscore = getErrorSuggestion('insufficient_credits', 'citizenship_apply');
    const grouped = getErrorSuggestion('insufficient_credits', 'citizenship apply');
    expect(underscore).toBe(grouped);
    expect(underscore).toContain('fee');
    expect(underscore).toContain('balance');
    expect(underscore).toContain('spacemolt get_status');
    expect(underscore).toContain('Do not run "spacemolt faction_deposit_credits"');
    expect(underscore).not.toContain('If the server message names the faction treasury');
    expect(underscore).not.toContain('dry_run');
    expect(underscore).not.toContain('labor');
    expect(underscore).not.toContain('50,000');
    expect(underscore).not.toContain('already held');
    expect(underscore).not.toContain('job stayed');
  });

  test('recycle and buy stay on the generic suggestion', () => {
    const generic = getErrorSuggestion('insufficient_credits');
    expect(getErrorSuggestion('insufficient_credits', 'recycle')).toBe(generic);
    expect(getErrorSuggestion('insufficient_credits', 'buy')).toBe(generic);
    const recycle = getErrorSuggestion('insufficient_credits', 'recycle');
    expect(recycle).not.toContain('dry_run');
    expect(recycle).not.toContain('preset=cheap');
    expect(recycle).not.toContain('50,000');
    expect(recycle).not.toContain('balance plus the fee');
  });

  test('related commands stay generic', () => {
    expect(getRelatedCommands('insufficient_credits')).toEqual(['get_status', 'faction_deposit_credits']);
  });

  test('no_credits is unchanged and has no craft overlay', () => {
    expect(getErrorSuggestion('no_credits')).toContain('Mine and sell');
    expect(getErrorSuggestion('insufficient_credits')).not.toContain('Mine and sell');
    expect(getErrorSuggestion('no_credits', 'craft')).toBe(getErrorSuggestion('no_credits'));
  });
});
