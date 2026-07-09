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
});
