import { describe, expect, test } from 'bun:test';
import {
  ERROR_REGISTRY,
  getErrorSuggestion,
  getRelatedCommands,
  isAuthError,
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

  test('rule_* fight-start codes stay unregistered and default to retryable', () => {
    expect(isRetryableError('rule_hull_tier')).toBe(true);
    expect(ERROR_REGISTRY.rule_hull_tier).toBeUndefined();
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
    expect(getErrorSuggestion('cargo_capacity_exceeded')).toContain('spacemolt loot_wreck');
    expect(getErrorSuggestion('cargo_capacity_exceeded')).not.toContain('storage_loot');
    expect(getRelatedCommands('cargo_capacity_exceeded')).toEqual([
      'get_ship',
      'uninstall_mod',
      'install_mod',
      'loot_wreck',
    ]);
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
});
