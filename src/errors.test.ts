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

describe('trade_in_progress', () => {
  test('is not retryable, is not an authentication error, and forbids cancel or decline retries', () => {
    expect(ERROR_REGISTRY.trade_in_progress?.retryable).toBe(false);
    expect(ERROR_REGISTRY.trade_in_progress?.auth).toBe(false);
    expect(isRetryableError('trade_in_progress')).toBe(false);
    expect(isAuthError('trade_in_progress')).toBe(false);
    expect(isKnownErrorCode('trade_in_progress')).toBe(true);
    expect(ERROR_CODES).toContain('trade_in_progress');
    const suggestion = getErrorSuggestion('trade_in_progress');
    expect(suggestion).toMatch(/the other side's accept/i);
    expect(suggestion).toContain('will complete');
    expect(suggestion).toContain('Do not retry');
    expect(suggestion).toContain('spacemolt trade_cancel');
    expect(suggestion).toContain('spacemolt trade_decline');
    expect(suggestion).not.toMatch(/\bretry (the|this|your|again)\b/i);
    expect(suggestion).not.toContain('This error may be retryable');
    expect(getErrorSuggestion('trade_in_progress', 'trade_cancel')).toBe(suggestion);
    expect(getErrorSuggestion('trade_in_progress', 'trade_decline')).toBe(suggestion);
    expect(ERROR_REGISTRY.trade_in_progress?.commandSuggestions).toBeUndefined();
    expect(getRelatedCommands('trade_in_progress')).toEqual(['get_trades']);
  });
});

describe('trade_not_found', () => {
  test('is not retryable, is not an authentication error, and points at get_trades', () => {
    expect(ERROR_REGISTRY.trade_not_found?.retryable).toBe(false);
    expect(ERROR_REGISTRY.trade_not_found?.auth).toBe(false);
    expect(isRetryableError('trade_not_found')).toBe(false);
    expect(isAuthError('trade_not_found')).toBe(false);
    expect(isKnownErrorCode('trade_not_found')).toBe(true);
    expect(ERROR_CODES).toContain('trade_not_found');
    const suggestion = getErrorSuggestion('trade_not_found');
    expect(suggestion).toContain('spacemolt get_trades');
    expect(suggestion).toContain('already gone');
    expect(suggestion).not.toContain('Do not retry');
    expect(suggestion).not.toMatch(/\bretry (the|this|your|again)\b/i);
    expect(suggestion).not.toContain('This error may be retryable');
    expect(getErrorSuggestion('trade_not_found', 'trade_cancel')).toBe(suggestion);
    expect(getErrorSuggestion('trade_not_found', 'trade_decline')).toBe(suggestion);
    expect(ERROR_REGISTRY.trade_not_found?.commandSuggestions).toBeUndefined();
    expect(getRelatedCommands('trade_not_found')).toEqual(['get_trades']);
  });
});

describe('persist_failed', () => {
  test('is retryable, is not an authentication error, and states that nothing changed', () => {
    expect(ERROR_REGISTRY.persist_failed?.retryable).toBe(true);
    expect(ERROR_REGISTRY.persist_failed?.auth).toBe(false);
    expect(isRetryableError('persist_failed')).toBe(true);
    expect(isAuthError('persist_failed')).toBe(false);
    expect(isKnownErrorCode('persist_failed')).toBe(true);
    expect(ERROR_CODES).toContain('persist_failed');
    expect(ERROR_REGISTRY.persist_failed?.message).toBe('Persistence confirmation failed.');
    const suggestion = getErrorSuggestion('persist_failed');
    expect(suggestion).toBe(
      'The server could not save the change. Nothing was charged, moved or changed. Check your state with "spacemolt get_status", then retry.',
    );
    expect(suggestion).not.toContain('This error may be retryable');
    expect(ERROR_REGISTRY.persist_failed?.commandSuggestions).toBeUndefined();
    expect(getErrorSuggestion('persist_failed', 'buy_insurance')).toBe(suggestion);
    expect(getErrorSuggestion('persist_failed', 'create_note')).toBe(suggestion);
    expect(getErrorSuggestion('persist_failed', 'write_note')).toBe(suggestion);
    expect(getErrorSuggestion('persist_failed', 'delete_note')).toBe(suggestion);
    expect(getErrorSuggestion('persist_failed', 'mine')).toBe(suggestion);
    expect(getRelatedCommands('persist_failed')).toEqual(['get_status']);
    const timeoutSuggestion = getErrorSuggestion('persist_timeout');
    expect(timeoutSuggestion).toContain('Verify your state');
    expect(timeoutSuggestion).not.toContain('Nothing was charged');
  });
});

describe('transaction_uncertain', () => {
  test('is not retryable, is not an authentication error, and forbids retrying the transfer', () => {
    expect(ERROR_REGISTRY.transaction_uncertain?.retryable).toBe(false);
    expect(ERROR_REGISTRY.transaction_uncertain?.auth).toBe(false);
    expect(isRetryableError('transaction_uncertain')).toBe(false);
    expect(isAuthError('transaction_uncertain')).toBe(false);
    expect(isKnownErrorCode('transaction_uncertain')).toBe(true);
    expect(ERROR_CODES).toContain('transaction_uncertain');
    expect(ERROR_REGISTRY.transaction_uncertain?.message).toBe('The transfer may already be committed.');
    const suggestion = getErrorSuggestion('transaction_uncertain');
    expect(suggestion).toContain('may already be committed');
    expect(suggestion).toContain('Do not retry');
    expect(suggestion).toContain('retry it');
    expect(suggestion).toContain('Mutations resume automatically');
    expect(suggestion).toContain('spacemolt get_action_log');
    expect(suggestion).toContain('faction_id=');
    expect(suggestion).toContain('Do not send the transfer again');
    expect(suggestion).not.toContain('This error may be retryable');
    expect(suggestion).not.toContain('get_status');
    expect(suggestion).not.toContain('before retrying');
    expect(suggestion).not.toContain('retry the same command');
    expect(suggestion).not.toContain('then retry');
    expect(getErrorSuggestion('transaction_uncertain', 'faction_deposit_credits')).toBe(suggestion);
    expect(getErrorSuggestion('transaction_uncertain', 'faction deposit_credits')).toBe(suggestion);
    expect(getErrorSuggestion('transaction_uncertain', 'storage deposit')).toBe(suggestion);
    expect(getErrorSuggestion('transaction_uncertain', 'mine')).toBe(suggestion);
    expect(ERROR_REGISTRY.transaction_uncertain?.commandSuggestions).toBeUndefined();
    expect(getRelatedCommands('transaction_uncertain')).toEqual(['get_action_log']);
    expect(isRetryableError('insufficient_credits')).toBe(true);
  });
});

describe('accounting_pending', () => {
  test('is not retryable, is not an authentication error, and forbids retrying the original transfer', () => {
    expect(ERROR_REGISTRY.accounting_pending?.retryable).toBe(false);
    expect(ERROR_REGISTRY.accounting_pending?.auth).toBe(false);
    expect(isRetryableError('accounting_pending')).toBe(false);
    expect(isAuthError('accounting_pending')).toBe(false);
    expect(isKnownErrorCode('accounting_pending')).toBe(true);
    expect(ERROR_CODES).toContain('accounting_pending');
    expect(ERROR_REGISTRY.accounting_pending?.message).toBe(
      'Gameplay mutations are paused during transfer reconciliation.',
    );
    const suggestion = getErrorSuggestion('accounting_pending');
    expect(suggestion).toContain('Gameplay mutations are paused');
    expect(suggestion).toContain('Do not retry');
    expect(suggestion).toContain('Do not retry the original uncertain transfer');
    expect(suggestion).not.toContain('Do not send the transfer again');
    expect(suggestion).not.toContain('retry it');
    expect(suggestion).toContain('Mutations resume automatically');
    expect(suggestion).toContain('spacemolt get_action_log');
    expect(suggestion).toContain('faction_id=');
    expect(suggestion).not.toContain('This error may be retryable');
    expect(suggestion).not.toContain('get_status');
    expect(suggestion).not.toContain('before retrying');
    expect(suggestion).not.toContain('retry the same command');
    expect(suggestion).not.toContain('then retry');
    expect(getErrorSuggestion('accounting_pending', 'faction_deposit_credits')).toBe(suggestion);
    expect(getErrorSuggestion('accounting_pending', 'faction deposit_credits')).toBe(suggestion);
    expect(getErrorSuggestion('accounting_pending', 'storage deposit')).toBe(suggestion);
    expect(getErrorSuggestion('accounting_pending', 'mine')).toBe(suggestion);
    expect(ERROR_REGISTRY.accounting_pending?.commandSuggestions).toBeUndefined();
    expect(getRelatedCommands('accounting_pending')).toEqual(['get_action_log']);
  });
});

describe('target_cloaked', () => {
  test('is no longer a known code', () => {
    expect(ERROR_REGISTRY.target_cloaked).toBeUndefined();
    expect(getErrorSuggestion('target_cloaked')).toBeUndefined();
    expect(isRetryableError('target_cloaked')).toBe(true);
    expect(isKnownErrorCode('target_cloaked')).toBe(false);
    expect(ERROR_CODES).not.toContain('target_cloaked');
  });
});

describe('invalid_target', () => {
  test('stays global, with attack and hunt overlays and no scan suggestion', () => {
    expect(ERROR_REGISTRY.invalid_target?.retryable).toBe(false);
    expect(ERROR_REGISTRY.invalid_target?.auth).toBe(false);
    expect(isRetryableError('invalid_target')).toBe(false);
    expect(isAuthError('invalid_target')).toBe(false);
    expect(isKnownErrorCode('invalid_target')).toBe(true);
    expect(ERROR_CODES).toContain('invalid_target');
    expect(ERROR_REGISTRY.invalid_target?.message).toBe('Invalid target.');
    expect(Object.keys(ERROR_REGISTRY.invalid_target?.commandSuggestions ?? {})).toEqual(['attack', 'hunt']);

    const generic = getErrorSuggestion('invalid_target');
    expect(generic).toContain('get_nearby');
    expect(generic).not.toContain('scan');
    expect(getErrorSuggestion('invalid_target', 'repair')).toBe(generic);

    const attack = getErrorSuggestion('invalid_target', 'attack');
    const hunt = getErrorSuggestion('invalid_target', 'hunt');
    expect(attack).toBe(hunt);
    expect(attack).toContain('get_battle_status');
    expect(attack).not.toContain('scan');
    expect(hunt).toContain('get_battle_status');
    expect(hunt).not.toContain('scan');
    expect(getRelatedCommands('invalid_target')).toEqual(['get_nearby']);
  });
});

describe('own_faction_station', () => {
  test('is not retryable, with attack, battle_engage, and join_faction overlays', () => {
    expect(ERROR_REGISTRY.own_faction_station?.retryable).toBe(false);
    expect(ERROR_REGISTRY.own_faction_station?.auth).toBe(false);
    expect(isRetryableError('own_faction_station')).toBe(false);
    expect(isAuthError('own_faction_station')).toBe(false);
    expect(isKnownErrorCode('own_faction_station')).toBe(true);
    expect(ERROR_CODES).toContain('own_faction_station');
    expect(ERROR_REGISTRY.own_faction_station?.message).toBe('You cannot fight a station your own faction owns.');
    expect(Object.keys(ERROR_REGISTRY.own_faction_station?.commandSuggestions ?? {})).toEqual([
      'attack',
      'battle_engage',
      'join_faction',
    ]);

    const generic = getErrorSuggestion('own_faction_station');
    expect(generic).toBe(
      'You cannot fight a station your own faction owns. Do not attack that station. On battle_engage, omit side_id to join your station\'s side. On join_faction, leave the battle first, then retry. Run "spacemolt get_battle_status" to see the fight.',
    );
    expect(getErrorSuggestion('own_faction_station', 'repair')).toBe(generic);
    expect(getErrorSuggestion('own_faction_station', 'faction join')).toBe(generic);
    expect(generic).not.toContain('faction join');
    expect(generic).toContain('join_faction');
    expect(generic).toContain('battle_engage');
    expect(generic).toContain('get_battle_status');
    expect(generic).toContain('On battle_engage, omit side_id');
    expect(generic).not.toContain('Do not retry "spacemolt attack"');
    expect(generic).not.toContain('This error may be retryable');

    const attack = getErrorSuggestion('own_faction_station', 'attack');
    expect(attack).toContain('spacemolt attack');
    expect(attack).not.toContain('omit side_id');
    expect(attack).not.toContain('This error may be retryable');

    const engage = getErrorSuggestion('own_faction_station', 'battle_engage');
    expect(getErrorSuggestion('own_faction_station', 'battle engage')).toBe(engage);
    expect(engage).toContain('Omit side_id');
    expect(engage).not.toContain('join_faction');
    expect(engage).not.toContain('This error may be retryable');

    const join = getErrorSuggestion('own_faction_station', 'join_faction');
    expect(join).toContain('spacemolt join_faction');
    expect(join).toContain('get_battle_status');
    expect(join).not.toContain('omit side_id');
    expect(join).not.toContain('This error may be retryable');

    expect(getRelatedCommands('own_faction_station')).toEqual(['get_battle_status']);
  });
});

describe('player_not_found', () => {
  test('is one global suggestion for every documented caller', () => {
    expect(ERROR_REGISTRY.player_not_found?.retryable).toBe(false);
    expect(ERROR_REGISTRY.player_not_found?.auth).toBe(false);
    expect(isRetryableError('player_not_found')).toBe(false);
    expect(isAuthError('player_not_found')).toBe(false);
    expect(isKnownErrorCode('player_not_found')).toBe(true);
    expect(ERROR_CODES).toContain('player_not_found');
    expect(ERROR_REGISTRY.player_not_found?.commandSuggestions).toBeUndefined();
    expect(ERROR_REGISTRY.player_not_found?.message).toBe('Player not found.');

    const suggestion = getErrorSuggestion('player_not_found');
    expect(suggestion).toContain('unknown name');
    expect(suggestion).toContain('get_nearby');
    expect(suggestion).not.toContain('scan');
    expect(suggestion).not.toContain('attack');
    for (const command of [
      'trade_offer',
      'refuel',
      'repair',
      'arena challenge',
      'fleet invite',
      'transfer_personnel',
      'treat_personnel',
    ]) {
      expect(getErrorSuggestion('player_not_found', command)).toBe(suggestion);
    }
    expect(getErrorSuggestion('player_not_found', 'arena_challenge')).toBe(suggestion);
    expect(getRelatedCommands('player_not_found')).toEqual(['get_nearby']);
  });
});

describe('in_battle', () => {
  test('is retryable, names cloak, and has no overlays', () => {
    expect(ERROR_REGISTRY.in_battle?.retryable).toBe(true);
    expect(ERROR_REGISTRY.in_battle?.auth).toBe(false);
    expect(isRetryableError('in_battle')).toBe(true);
    expect(isAuthError('in_battle')).toBe(false);
    expect(isKnownErrorCode('in_battle')).toBe(true);
    expect(ERROR_CODES).toContain('in_battle');
    expect(ERROR_REGISTRY.in_battle?.commandSuggestions).toBeUndefined();
    const suggestion = getErrorSuggestion('in_battle');
    expect(suggestion).toContain('cloak');
    expect(suggestion).toContain('get_battle_status');
    expect(getErrorSuggestion('in_battle', 'cloak')).toBe(suggestion);
    expect(getRelatedCommands('in_battle')).toEqual(['get_battle_status', 'cloak']);
  });
});

describe('wreck_not_found', () => {
  test('is not retryable and points at wrecks at your POI', () => {
    expect(ERROR_REGISTRY.wreck_not_found?.retryable).toBe(false);
    expect(ERROR_REGISTRY.wreck_not_found?.auth).toBe(false);
    expect(isRetryableError('wreck_not_found')).toBe(false);
    expect(isAuthError('wreck_not_found')).toBe(false);
    expect(isKnownErrorCode('wreck_not_found')).toBe(true);
    expect(ERROR_CODES).toContain('wreck_not_found');
    expect(ERROR_REGISTRY.wreck_not_found?.commandSuggestions).toBeUndefined();
    const suggestion = getErrorSuggestion('wreck_not_found');
    expect(suggestion).toContain('wreck_not_found');
    expect(suggestion).toContain('get_wrecks');
    expect(suggestion).not.toMatch(/(^|\s)not_found(\s|$)/);
    expect(suggestion).not.toContain('returns not_found');
    expect(getRelatedCommands('wreck_not_found')).toEqual(['get_wrecks', 'tow_wreck']);
  });
});

describe('not_found', () => {
  test('generic text does not mention a wreck, and loot and inspect overlays differ', () => {
    expect(ERROR_REGISTRY.not_found?.retryable).toBe(false);
    expect(ERROR_REGISTRY.not_found?.auth).toBe(false);
    expect(isRetryableError('not_found')).toBe(false);
    expect(isAuthError('not_found')).toBe(false);
    expect(isKnownErrorCode('not_found')).toBe(true);
    expect(ERROR_CODES).toContain('not_found');
    expect(Object.keys(ERROR_REGISTRY.not_found?.commandSuggestions ?? {})).toEqual([
      'loot_wreck',
      'storage_loot',
      'inspect',
    ]);

    const generic = getErrorSuggestion('not_found');
    expect(generic).not.toContain('wreck');
    expect(generic).not.toContain('get_wrecks');
    expect(getErrorSuggestion('not_found', 'jump')).toBe(generic);

    const loot = getErrorSuggestion('not_found', 'loot_wreck');
    const storage = getErrorSuggestion('not_found', 'storage loot');
    expect(loot).toBe(storage);
    expect(getErrorSuggestion('not_found', 'storage_loot')).toBe(loot);
    expect(loot).toContain('another POI');
    expect(loot).toContain('get_wrecks');
    expect(storage).toContain('another POI');
    expect(storage).toContain('get_wrecks');

    const inspect = getErrorSuggestion('not_found', 'inspect');
    expect(inspect).toContain('survey_system');
    expect(inspect).not.toContain('get_wrecks');
    expect(getRelatedCommands('not_found')).toEqual([]);
  });
});

describe('unknown_system', () => {
  test('names the charting recipe and get_system', () => {
    expect(ERROR_REGISTRY.unknown_system?.retryable).toBe(false);
    expect(ERROR_REGISTRY.unknown_system?.auth).toBe(false);
    expect(isRetryableError('unknown_system')).toBe(false);
    expect(isAuthError('unknown_system')).toBe(false);
    expect(isKnownErrorCode('unknown_system')).toBe(true);
    expect(ERROR_CODES).toContain('unknown_system');
    expect(ERROR_REGISTRY.unknown_system?.commandSuggestions).toBeUndefined();
    const suggestion = getErrorSuggestion('unknown_system');
    expect(suggestion).toContain('survey_system');
    expect(suggestion).toContain('faction intel');
    expect(suggestion).toContain('get_system');
    expect(getRelatedCommands('unknown_system')).toEqual(['get_system', 'jump', 'survey_system']);
  });
});

describe('system_not_found', () => {
  test('names find_route and the charting recipe', () => {
    expect(ERROR_REGISTRY.system_not_found?.retryable).toBe(false);
    expect(ERROR_REGISTRY.system_not_found?.auth).toBe(false);
    expect(isRetryableError('system_not_found')).toBe(false);
    expect(isAuthError('system_not_found')).toBe(false);
    expect(isKnownErrorCode('system_not_found')).toBe(true);
    expect(ERROR_CODES).toContain('system_not_found');
    expect(ERROR_REGISTRY.system_not_found?.commandSuggestions).toBeUndefined();
    const suggestion = getErrorSuggestion('system_not_found');
    expect(suggestion).toContain('survey_system');
    expect(suggestion).toContain('faction intel');
    expect(suggestion).toContain('find_route');
    expect(getRelatedCommands('system_not_found')).toEqual(['find_route', 'survey_system', 'get_system']);
  });
});

describe('poi_not_found', () => {
  test('says faction scan_poi, not the flat invocation', () => {
    expect(ERROR_REGISTRY.poi_not_found?.retryable).toBe(false);
    expect(ERROR_REGISTRY.poi_not_found?.auth).toBe(false);
    expect(isRetryableError('poi_not_found')).toBe(false);
    expect(isAuthError('poi_not_found')).toBe(false);
    expect(isKnownErrorCode('poi_not_found')).toBe(true);
    expect(ERROR_CODES).toContain('poi_not_found');
    expect(ERROR_REGISTRY.poi_not_found?.commandSuggestions).toBeUndefined();
    const suggestion = getErrorSuggestion('poi_not_found');
    expect(suggestion).toContain('survey_system');
    expect(suggestion).toContain('faction intel');
    expect(suggestion).toContain('faction scan_poi');
    expect(suggestion).not.toContain('spacemolt faction_scan_poi');
    expect(getRelatedCommands('poi_not_found')).toEqual(['faction_scan_poi', 'survey_system']);
  });
});

describe('invalid_poi', () => {
  test('says an uncharted hidden POI looks like an unknown id', () => {
    expect(ERROR_REGISTRY.invalid_poi?.retryable).toBe(false);
    expect(ERROR_REGISTRY.invalid_poi?.auth).toBe(false);
    expect(isRetryableError('invalid_poi')).toBe(false);
    expect(isAuthError('invalid_poi')).toBe(false);
    expect(isKnownErrorCode('invalid_poi')).toBe(true);
    expect(ERROR_CODES).toContain('invalid_poi');
    const suggestion = getErrorSuggestion('invalid_poi');
    expect(suggestion).toContain('uncharted hidden POI');
    expect(suggestion).toContain('get_system');
    expect(suggestion).toContain('survey_system');
    expect(getRelatedCommands('invalid_poi')).toEqual(['get_system', 'survey_system']);
  });
});

describe('no_scanner', () => {
  test('is not retryable and suggests a scanner for the command that failed', () => {
    expect(isKnownErrorCode('no_scanner')).toBe(true);
    expect(isRetryableError('no_scanner')).toBe(false);
    expect(ERROR_REGISTRY.no_scanner?.retryable).toBe(false);
    expect(ERROR_REGISTRY.no_scanner?.auth).toBe(false);
    expect(getErrorSuggestion('no_scanner')).toContain('get_ship');

    const scan = getErrorSuggestion('no_scanner', 'scan');
    expect(scan).toContain('ship_scanner_i');
    expect(scan).toContain('install_mod');

    const observation = getErrorSuggestion('no_scanner', 'subscribe_observation');
    expect(observation).not.toContain('survey_system');
    expect(observation?.startsWith('survey_system needs a ship scanner')).toBe(false);

    const survey = getErrorSuggestion('no_scanner', 'survey_system');
    expect(survey).toContain('module, hull, or consumable');
    expect(survey).not.toContain('ship_scanner_i');

    expect(ERROR_REGISTRY.target_cloaked).toBeUndefined();
    expect(getErrorSuggestion('target_cloaked')).toBeUndefined();
  });
});
