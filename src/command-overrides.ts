import { BATTLE_SHIPYARD_COMMAND_OVERRIDES } from './command-overrides-battle-shipyard';
import { COMMERCE_FACILITY_COMMAND_OVERRIDES } from './command-overrides-commerce-facility';
import { CORE_COMMAND_OVERRIDES } from './command-overrides-core';
import { FACTION_SOCIAL_COMMAND_OVERRIDES } from './command-overrides-faction-social';
import { QUERY_REFERENCE_COMMAND_OVERRIDES } from './command-overrides-query-reference';
import type { CommandOverride } from './commands';

export const COMMAND_OVERRIDES: Record<string, CommandOverride> = {
  ...CORE_COMMAND_OVERRIDES,
  ...FACTION_SOCIAL_COMMAND_OVERRIDES,
  ...COMMERCE_FACILITY_COMMAND_OVERRIDES,
  ...BATTLE_SHIPYARD_COMMAND_OVERRIDES,
  ...QUERY_REFERENCE_COMMAND_OVERRIDES,
};
