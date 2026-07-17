import { describe, expect, test } from 'bun:test';
import {
  commandGroup,
  GROUPED_COMMANDS,
  groupActionDisplayName,
  groupedCommandParts,
  splitGroupedCommands,
} from './command-groups';
import { BUNDLED_COMMAND_REGISTRY, buildCommandRegistrySnapshot } from './command-registry';
import type { CommandConfig } from './commands';
import { GENERATED_API_ROUTES } from './generated/api-commands';

const command = (action: string): CommandConfig => ({
  description: `Run ${action}`,
  args: [],
  required: [],
  route: { tool: 'spacemolt_faction', action },
});

describe('nested command groups', () => {
  test('recognizes only exact configured flat prefixes', () => {
    expect(GROUPED_COMMANDS).toEqual([
      'citizenship',
      'facility',
      'faction',
      'fleet',
      'forum',
      'station',
      'storage',
      'trade',
    ]);
    expect(groupedCommandParts('faction_info')).toEqual({ group: 'faction', action: 'info' });
    expect(groupedCommandParts('storage_view')).toEqual({ group: 'storage', action: 'view' });
    expect(groupedCommandParts('get_faction_achievements')).toBeUndefined();
    expect(groupedCommandParts('faction')).toBeUndefined();
    expect(groupedCommandParts('faction_')).toBeUndefined();
  });

  test('splits grouped flat commands out of accepted commands', () => {
    const split = splitGroupedCommands({
      faction_info: command('info'),
      faction_invite: command('invite'),
      get_faction_achievements: command('get_faction_achievements'),
    });

    expect(Object.keys(split.commands)).toEqual(['get_faction_achievements']);
    const factionGroup = commandGroup(split.commandGroups, 'faction');
    expect(factionGroup).toBeDefined();
    if (!factionGroup) return;
    expect(Object.keys(factionGroup.actions)).toEqual(['info', 'invite']);
    const infoAction = factionGroup.actions.info;
    expect(infoAction).toBeDefined();
    if (!infoAction) return;
    expect(infoAction.command).toBe('faction_info');
    expect(infoAction.displayName).toBe('faction info');
    expect(split.allGroupEntries.faction).toMatchObject({
      usage: '<action> [args...]',
      category: 'Command groups',
    });
  });

  test('bundled registry hides grouped flat commands and exposes groups', () => {
    expect(BUNDLED_COMMAND_REGISTRY.commands.faction_info).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.allCommands.faction_info).toBeUndefined();
    expect(commandGroup(BUNDLED_COMMAND_REGISTRY.commandGroups, 'faction')?.actions.info?.command).toBe('faction_info');
    expect(commandGroup(BUNDLED_COMMAND_REGISTRY.commandGroups, 'facility')?.actions.job_add?.command).toBe(
      'facility_job_add',
    );
    expect(commandGroup(BUNDLED_COMMAND_REGISTRY.commandGroups, 'storage')?.actions.view?.command).toBe('storage_view');
    expect(commandGroup(BUNDLED_COMMAND_REGISTRY.commandGroups, 'storage')?.actions.deposit?.command).toBe(
      'storage_deposit',
    );
    expect(BUNDLED_COMMAND_REGISTRY.commands.storage).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.storage_view).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.allCommands.faction).toBeDefined();
    expect(BUNDLED_COMMAND_REGISTRY.allCommands.storage).toBeDefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.get_faction_achievements).toBeDefined();
  });

  test('dynamic generated commands are grouped with curated commands', () => {
    const registry = buildCommandRegistrySnapshot({
      generatedRoutes: {
        ...GENERATED_API_ROUTES,
        'POST /api/v2/spacemolt_faction/new_action': {
          operationId: 'spacemolt_faction_new_action',
          summary: 'Generated grouped faction action',
          route: { tool: 'spacemolt_faction', action: 'new_action', method: 'POST' },
          schema: { target_id: { type: 'string', positionalIndex: 0, description: 'Target' } },
          required: ['target_id'],
        },
      },
      dynamicGeneratedRoutes: {
        'POST /api/v2/spacemolt_faction/new_action': {
          operationId: 'spacemolt_faction_new_action',
          summary: 'Generated grouped faction action',
          route: { tool: 'spacemolt_faction', action: 'new_action', method: 'POST' },
          schema: { target_id: { type: 'string', positionalIndex: 0, description: 'Target' } },
          required: ['target_id'],
        },
      },
    });

    expect(registry.commands.faction_new_action).toBeUndefined();
    expect(registry.allCommands.faction_new_action).toBeUndefined();
    expect(commandGroup(registry.commandGroups, 'faction')?.actions.new_action?.command).toBe('faction_new_action');
  });

  test('formats nested action display names', () => {
    expect(groupActionDisplayName('trade', 'offer')).toBe('trade offer');
  });
});
