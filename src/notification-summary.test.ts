import { describe, expect, test } from 'bun:test';
import { presentNotifications, presentResponseNotifications } from './notification-summary';
import type { APIResponse } from './types';

const progressA = {
  type: 'crafting',
  msg_type: 'crafting_progress',
  timestamp: '2026-06-29T00:00:00.000Z',
  data: { tick: 901237, job_id: 'job-a', message: 'Crafting steel plate.' },
};

const progressB = {
  type: 'system',
  msg_type: 'crafting_tick',
  timestamp: '2026-06-29T00:00:20.000Z',
  data: { event_type: 'crafting.progress', tick: 901239, job_id: 'job-b', message: 'Crafting fuel cells.' },
};

const trade = {
  type: 'trade',
  msg_type: 'trade_offer_received',
  timestamp: '2026-06-29T00:00:10.000Z',
  data: { from_name: 'Dockmaster', trade_id: 'trade-1' },
};

const actionResultA = {
  type: 'action_result',
  msg_type: 'action_result',
  timestamp: '2026-07-24T19:05:05.000Z',
  data: {
    command: 'undock',
    tick: 1433948,
    result: {
      details: { action: 'undock' },
      location: { nearby_players: [{ username: 'Crowd' }] },
    },
  },
};

const actionResultB = {
  type: 'action_result',
  msg_type: 'action_result',
  timestamp: '2026-07-24T19:05:24.000Z',
  data: {
    command: 'jump',
    tick: 1433950,
    result: {
      details: {
        action: 'jumped',
        system: 'Lacaille 9352',
        system_id: 'lacaille_9352',
        poi: 'theta_proxima_belt',
      },
    },
  },
};

const systemJumpA = {
  type: 'system',
  msg_type: 'system',
  timestamp: '2026-07-24T19:05:15.000Z',
  data: { action: 'jump', arrival_tick: 1433950, destination: 'lacaille_9352', is_wormhole: false },
};

const systemJumpB = {
  type: 'system',
  msg_type: 'system',
  timestamp: '2026-07-24T19:05:35.000Z',
  data: { action: 'jump', arrival_tick: 1433952, destination: 'grumium', is_wormhole: false },
};

const actionFailed = {
  type: 'action_error',
  msg_type: 'action_error',
  timestamp: '2026-07-24T19:13:45.000Z',
  data: {
    command: 'buy_listed_ship',
    tick: 1434000,
    message: 'skill_required: Flying a Tier 5 ship requires Piloting level 50 (you have 38).',
  },
};

describe('notification presentation', () => {
  test('summarizes routine crafting progress into one synthetic row and preserves non-crafting order', () => {
    const presented = presentNotifications([progressA, trade, progressB]);

    expect(presented.rawCount).toBe(3);
    expect(presented.shownCount).toBe(2);
    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['crafting_summary', 'trade_offer_received']);

    const summary = presented.notifications[0];
    expect(summary).toMatchObject({
      type: 'crafting',
      msg_type: 'crafting_summary',
      timestamp: '2026-06-29T00:00:20.000Z',
      data: {
        count: 2,
        first_timestamp: '2026-06-29T00:00:00.000Z',
        latest_timestamp: '2026-06-29T00:00:20.000Z',
        first_tick: 901237,
        latest_tick: 901239,
        jobs: 2,
        latest_message: 'Crafting fuel cells.',
      },
    });
  });

  test('summarizes OpenAPI-shaped incomplete crafting updates as routine progress', () => {
    const updateA = {
      type: 'crafting',
      msg_type: 'crafting_update',
      timestamp: '2026-06-29T00:00:00.000Z',
      data: {
        tick: 901300,
        jobs: [{ id: 'job-a', completed: false, recipe_id: 'steel_plate' }],
        message: 'Crafting in progress.',
      },
    };
    const updateB = {
      type: 'crafting',
      msg_type: 'crafting_update',
      timestamp: '2026-06-29T00:00:20.000Z',
      data: {
        tick: 901301,
        jobs: [{ id: 'job-a', completed: false, recipe_id: 'steel_plate' }],
        message: 'Crafting in progress.',
      },
    };

    const presented = presentNotifications([updateA, updateB]);

    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['crafting_summary']);
    expect(presented.summarizedCount).toBe(2);
  });

  test('crafting summary includes rental jobs and remaining escrowed credits', () => {
    const updateA = {
      type: 'crafting',
      msg_type: 'crafting_update',
      timestamp: '2026-06-29T00:00:00.000Z',
      data: {
        tick: 901400,
        jobs: [
          {
            job_id: 'own-job',
            recipe: 'Refine Steel',
            mode: 'facility',
            venue: 'Own Smelter',
            storage: 'storage',
            deposited: [],
            runs_done: 1,
            runs_remaining: 4,
            escrowed_credits: 0,
            external: false,
            completed: false,
          },
          {
            job_id: 'rental-job',
            recipe: 'Assemble Power Cell',
            mode: 'facility',
            venue: 'Public Assembler',
            storage: 'storage',
            deposited: [],
            runs_done: 0,
            runs_remaining: 3,
            escrowed_credits: 450,
            external: true,
            completed: false,
          },
        ],
      },
    };
    const updateB = {
      type: 'crafting',
      msg_type: 'crafting_update',
      timestamp: '2026-06-29T00:00:20.000Z',
      data: {
        tick: 901401,
        jobs: [
          {
            job_id: 'rental-job',
            recipe: 'Assemble Power Cell',
            mode: 'facility',
            venue: 'Public Assembler',
            storage: 'storage',
            deposited: [],
            runs_done: 1,
            runs_remaining: 2,
            escrowed_credits: 300,
            external: true,
            completed: false,
          },
        ],
      },
    };

    const presented = presentNotifications([updateA, updateB]);
    const summary = presented.notifications[0];

    expect(presented.summarizedCount).toBe(2);
    expect(summary).toMatchObject({
      msg_type: 'crafting_summary',
      data: {
        count: 2,
        jobs: 2,
        rental_jobs: 1,
        escrowed_credits: 300,
        latest_tick: 901401,
      },
    });
  });

  test('leaves value-level high-signal crafting updates visible', () => {
    const update = {
      type: 'crafting',
      msg_type: 'crafting_update',
      timestamp: '2026-06-29T00:00:00.000Z',
      data: {
        tick: 901300,
        jobs: [{ id: 'job-a', status: 'completed', recipe_id: 'steel_plate' }],
        message: 'Crafting in progress.',
      },
    };

    const presented = presentNotifications([update]);

    expect(presented.notifications).toEqual([update]);
    expect(presented.summarizedCount).toBe(0);
  });

  test('leaves crafting completion and failure notifications visible', () => {
    const completed = {
      type: 'crafting',
      msg_type: 'crafting_completed',
      timestamp: '2026-06-29T00:00:30.000Z',
      data: { event_type: 'crafting.completed', message: 'Completed steel plate.' },
    };
    const failed = {
      type: 'crafting',
      msg_type: 'crafting_failed',
      timestamp: '2026-06-29T00:00:40.000Z',
      data: { event_type: 'crafting.failed', message: 'Missing input.' },
    };

    const presented = presentNotifications([progressA, completed, failed]);

    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'crafting_summary',
      'crafting_completed',
      'crafting_failed',
    ]);
    expect(presented.summarizedCount).toBe(1);
  });

  test.each([
    ['crafting_completed'],
    ['crafting_failed'],
    ['crafting_cancelled'],
    ['crafting_refund'],
    ['crafting_error'],
  ])('leaves high-signal crafting event %s visible', (msgType) => {
    const notification = {
      type: 'crafting',
      msg_type: msgType,
      timestamp: '2026-06-29T00:01:00.000Z',
      data: { message: msgType },
    };

    const presented = presentNotifications([notification]);

    expect(presented.notifications).toEqual([notification]);
    expect(presented.summarizedCount).toBe(0);
  });

  test('does not summarize non-crafting notifications that merely mention craft text', () => {
    const notification = {
      type: 'market',
      msg_type: 'market_update',
      timestamp: '2026-06-29T00:01:00.000Z',
      data: { item_name: 'Handcrafted Trinket', crafting_time: 20, craftable: true },
    };

    const presented = presentNotifications([notification]);

    expect(presented.notifications).toEqual([notification]);
    expect(presented.summarizedCount).toBe(0);
  });

  test('does not mutate raw notifications', () => {
    const raw = [progressA, progressB];
    const before = structuredClone(raw);

    presentNotifications(raw);

    expect(raw).toEqual(before);
  });

  test('presents notification arrays in response envelope, structuredContent, and object result', () => {
    const response: APIResponse = {
      notifications: [progressA, progressB],
      structuredContent: { notifications: [progressA, progressB], count: 2 },
      result: { notifications: [progressA, progressB], count: 2 },
    };

    const presented = presentResponseNotifications(response);

    expect(presented.response.notifications?.map((n) => n.msg_type)).toEqual(['crafting_summary']);
    expect(
      (presented.response.structuredContent?.notifications as Array<{ msg_type?: string }>).map((n) => n.msg_type),
    ).toEqual(['crafting_summary']);
    expect(
      ((presented.response.result as Record<string, unknown>).notifications as Array<{ msg_type?: string }>).map(
        (n) => n.msg_type,
      ),
    ).toEqual(['crafting_summary']);
    expect(response.notifications?.map((n) => n.msg_type)).toEqual(['crafting_progress', 'crafting_tick']);
  });

  test('leaves malformed top-level notification values unchanged without throwing', () => {
    const response = {
      notifications: [null],
      structuredContent: { ok: true },
    } as unknown as APIResponse;

    const presented = presentResponseNotifications(response);

    expect(presented.response).toBe(response);
    expect(presented.topLevel).toBeUndefined();
  });

  test('raw option returns the original response object', () => {
    const response: APIResponse = { notifications: [progressA, progressB] };

    const presented = presentResponseNotifications(response, { rawNotifications: true });

    expect(presented.response).toBe(response);
    expect(presented.topLevel?.notifications.map((n) => n.msg_type)).toEqual(['crafting_progress', 'crafting_tick']);
  });

  test('raw option leaves malformed top-level notifications unchanged without throwing', () => {
    const response = { notifications: [null] } as unknown as APIResponse;

    const presented = presentResponseNotifications(response, { rawNotifications: true });

    expect(presented.response).toBe(response);
    expect(presented.topLevel).toBeUndefined();
  });

  test('summarizes successful action_result and system travel progress while keeping failures', () => {
    const presented = presentNotifications([
      actionResultA,
      systemJumpA,
      actionResultB,
      systemJumpB,
      actionFailed,
      trade,
    ]);

    expect(presented.rawCount).toBe(6);
    expect(presented.shownCount).toBe(4);
    expect(presented.summarizedCount).toBe(4);
    expect(presented.summaries).toEqual([
      { type: 'action_result', count: 2 },
      { type: 'system_progress', count: 2 },
    ]);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'action_result_summary',
      'system_progress_summary',
      'action_error',
      'trade_offer_received',
    ]);

    expect(presented.notifications[0]).toMatchObject({
      type: 'action_result',
      msg_type: 'action_result_summary',
      timestamp: '2026-07-24T19:05:24.000Z',
      data: {
        count: 2,
        commands: { undock: 1, jump: 1 },
        first_tick: 1433948,
        latest_tick: 1433950,
        latest_command: 'jump',
        latest_message: 'jumped → Lacaille 9352 @ theta_proxima_belt',
      },
    });

    expect(presented.notifications[1]).toMatchObject({
      type: 'system',
      msg_type: 'system_progress_summary',
      timestamp: '2026-07-24T19:05:35.000Z',
      data: {
        count: 2,
        actions: { jump: 2 },
        latest_action: 'jump',
        latest_destination: 'grumium',
        latest_arrival_tick: 1433952,
      },
    });
  });

  test('keeps non-allowlisted action_result individual while summarizing travel commands', () => {
    const buyListedShip = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:05:00.000Z',
      data: {
        command: 'buy_listed_ship',
        tick: 1433940,
        result: { details: { action: 'buy_listed_ship', message: 'Purchased Dust Devil.' } },
      },
    };

    const presented = presentNotifications([buyListedShip, actionResultA, actionResultB]);

    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'action_result',
      'action_result_summary',
    ]);
    expect(presented.notifications[0]).toMatchObject({
      msg_type: 'action_result',
      data: { command: 'buy_listed_ship' },
    });
    expect(presented.notifications[1]).toMatchObject({
      msg_type: 'action_result_summary',
      data: {
        count: 2,
        commands: { undock: 1, jump: 1 },
      },
    });
  });

  test('keeps interleaved non-routine action_result individual while travel pair still summarizes', () => {
    const buyListedShip = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:05:10.000Z',
      data: {
        command: 'buy_listed_ship',
        tick: 1433945,
        result: { details: { action: 'buy_listed_ship' } },
      },
    };

    const presented = presentNotifications([actionResultA, buyListedShip, actionResultB]);

    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'action_result_summary',
      'action_result',
    ]);
    expect(presented.notifications[0]).toMatchObject({
      msg_type: 'action_result_summary',
      data: { count: 2, commands: { undock: 1, jump: 1 } },
    });
    expect(presented.notifications[1]).toMatchObject({
      msg_type: 'action_result',
      data: { command: 'buy_listed_ship' },
    });
  });

  test('does not summarize two non-routine action_result successes', () => {
    const mine = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:06:00.000Z',
      data: { command: 'mine', tick: 1434100, result: { details: { action: 'mine' } } },
    };
    const sell = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:06:05.000Z',
      data: { command: 'sell', tick: 1434101, result: { details: { action: 'sell' } } },
    };

    const presented = presentNotifications([mine, sell]);

    expect(presented.summarizedCount).toBe(0);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['action_result', 'action_result']);
    expect(presented.notifications.map((n) => (n.data as { command?: string }).command)).toEqual(['mine', 'sell']);
  });

  test('summarizes travel and dock action_results on the allowlist', () => {
    const travel = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:07:00.000Z',
      data: { command: 'travel', tick: 1434200, result: { details: { action: 'travel' } } },
    };
    const dock = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:07:05.000Z',
      data: { command: 'dock', tick: 1434201, result: { details: { action: 'dock' } } },
    };

    const presented = presentNotifications([travel, dock]);

    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['action_result_summary']);
    expect(presented.notifications[0]).toMatchObject({
      data: { count: 2, commands: { travel: 1, dock: 1 }, latest_command: 'dock' },
    });
  });

  test('summarizes fleet_jump and fleet_travel action_results', () => {
    const fleetJump = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:08:00.000Z',
      data: { command: 'fleet_jump', tick: 1434300, result: { details: { action: 'fleet_jump' } } },
    };
    const fleetTravel = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:08:05.000Z',
      data: { command: 'fleet_travel', tick: 1434301, result: { details: { action: 'fleet_travel' } } },
    };

    const presented = presentNotifications([fleetJump, fleetTravel]);

    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['action_result_summary']);
    expect(presented.notifications[0]).toMatchObject({
      data: { count: 2, commands: { fleet_jump: 1, fleet_travel: 1 }, latest_command: 'fleet_travel' },
    });
  });

  test('does not summarize action_results missing data.command (fail open)', () => {
    const missingA = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:09:00.000Z',
      data: { tick: 1434400, result: { details: { action: 'jump' } } },
    };
    const missingB = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:09:05.000Z',
      data: { tick: 1434401, result: { details: { action: 'undock' } } },
    };

    const presented = presentNotifications([missingA, missingB]);

    expect(presented.summarizedCount).toBe(0);
    expect(presented.notifications).toEqual([missingA, missingB]);
  });

  test('still summarizes jump action_results whose nested delta contains high-signal tokens', () => {
    const jumpWithErrorToken = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:10:00.000Z',
      data: {
        command: 'jump',
        tick: 1434500,
        result: {
          details: { action: 'jumped', system: 'error_boundary_system' },
          ship: { modules: [{ name: 'error_corrector', completed: true }] },
        },
      },
    };
    const jumpWithCompleteToken = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:10:05.000Z',
      data: {
        command: 'jump',
        tick: 1434501,
        result: {
          details: { action: 'jumped', system: 'complete_system' },
          location: { note: 'complete' },
        },
      },
    };

    const presented = presentNotifications([jumpWithErrorToken, jumpWithCompleteToken]);

    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['action_result_summary']);
    expect(presented.notifications[0]).toMatchObject({
      data: { count: 2, commands: { jump: 2 }, latest_command: 'jump' },
    });
  });

  test('does not summarize non-travel system actions even with destination or message', () => {
    const maintenanceWindow = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:11:00.000Z',
      data: { action: 'maintenance_window', message: 'Scheduled window.' },
    };
    const maintenanceWindowB = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:11:05.000Z',
      data: { action: 'maintenance_window', message: 'Still scheduled.' },
    };
    const rebootA = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:11:10.000Z',
      data: { action: 'reboot', destination: 'x' },
    };
    const rebootB = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:11:15.000Z',
      data: { action: 'reboot', destination: 'y' },
    };

    const maintenancePresented = presentNotifications([maintenanceWindow, maintenanceWindowB]);
    expect(maintenancePresented.summarizedCount).toBe(0);
    expect(maintenancePresented.notifications).toEqual([maintenanceWindow, maintenanceWindowB]);

    const rebootPresented = presentNotifications([rebootA, rebootB]);
    expect(rebootPresented.summarizedCount).toBe(0);
    expect(rebootPresented.notifications).toEqual([rebootA, rebootB]);
  });

  test('summarizes system travel when only action is jump (no destination)', () => {
    const jumpOnlyA = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:12:00.000Z',
      data: { action: 'jump' },
    };
    const jumpOnlyB = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:12:05.000Z',
      data: { action: 'jump' },
    };

    const presented = presentNotifications([jumpOnlyA, jumpOnlyB]);

    expect(presented.summarizedCount).toBe(2);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual(['system_progress_summary']);
    expect(presented.notifications[0]).toMatchObject({
      data: { count: 2, actions: { jump: 2 }, latest_action: 'jump' },
    });
  });

  test('actionResultMessage uses @ poi and accepts poi_name', () => {
    const undock = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:13:00.000Z',
      data: {
        command: 'undock',
        tick: 1434600,
        result: { details: { action: 'undock' } },
      },
    };
    const jumpWithPoiName = {
      type: 'action_result',
      msg_type: 'action_result',
      timestamp: '2026-07-24T19:13:05.000Z',
      data: {
        command: 'jump',
        tick: 1434601,
        result: {
          details: {
            action: 'jumped',
            system: 'Sol',
            poi_name: 'Earth Station',
          },
        },
      },
    };

    const presented = presentNotifications([undock, jumpWithPoiName]);

    expect(presented.notifications[0]).toMatchObject({
      msg_type: 'action_result_summary',
      data: {
        latest_command: 'jump',
        latest_message: 'jumped → Sol @ Earth Station',
      },
    });
  });

  test('does not summarize system tips or non-travel system messages', () => {
    const tip = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:00:00.000Z',
      data: { type: 'gameplay_tip', message: 'Refuel often.' },
    };
    const maintenance = {
      type: 'system',
      msg_type: 'system',
      timestamp: '2026-07-24T19:00:01.000Z',
      data: { message: 'Server maintenance scheduled.' },
    };

    const presented = presentNotifications([tip, maintenance, systemJumpA, systemJumpB]);

    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'system',
      'system',
      'system_progress_summary',
    ]);
    expect(presented.summarizedCount).toBe(2);
  });

  test('summarizes mixed crafting, action results, and system progress independently', () => {
    const presented = presentNotifications([progressA, actionResultA, systemJumpA, progressB, actionResultB]);

    // Lone system jump stays individual; action results and crafting collapse.
    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'crafting_summary',
      'action_result_summary',
      'system',
    ]);
    expect(presented.summaries).toEqual([
      { type: 'crafting', count: 2 },
      { type: 'action_result', count: 2 },
    ]);
  });

  test('leaves a single action_result and single system travel update unsummarized', () => {
    const presented = presentNotifications([actionResultA, systemJumpA, trade]);

    expect(presented.summarizedCount).toBe(0);
    expect(presented.notifications.map((n) => n.msg_type)).toEqual([
      'action_result',
      'system',
      'trade_offer_received',
    ]);
  });
});
