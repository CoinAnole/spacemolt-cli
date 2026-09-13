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
