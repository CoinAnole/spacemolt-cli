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
