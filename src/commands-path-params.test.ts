import { describe, expect, test } from 'bun:test';
import { applyPathParams, type V2Route } from './commands.ts';

function route(overrides: Partial<V2Route> = {}): V2Route {
  return {
    tool: 'public',
    action: 'test',
    method: 'GET',
    rootPath: 'api/players/{name}',
    pathParams: ['name'],
    ...overrides,
  };
}

describe('applyPathParams', () => {
  test('substitutes path params and strips them from residual payload', () => {
    const result = applyPathParams(route(), 'https://game.test/api/players/{name}', {
      name: 'Arbiter47',
      extra: true,
    });
    expect(result.url).toBe('https://game.test/api/players/Arbiter47');
    expect(result.residualPayload).toEqual({ extra: true });
  });

  test('encodes special characters in path segments', () => {
    const result = applyPathParams(route(), 'https://game.test/api/players/{name}', {
      name: 'NO/IR space',
    });
    expect(result.url).toBe('https://game.test/api/players/NO%2FIR%20space');
    expect(result.residualPayload).toEqual({});
  });

  test('fills multi-param templates and strips all path keys', () => {
    const multi = route({
      rootPath: 'api/{kind}/{id}',
      pathParams: ['kind', 'id'],
    });
    const result = applyPathParams(multi, 'https://game.test/api/{kind}/{id}', {
      kind: 'players',
      id: 'x y',
      keep: 1,
    });
    expect(result.url).toBe('https://game.test/api/players/x%20y');
    expect(result.residualPayload).toEqual({ keep: 1 });
  });

  test('passes through when route has no pathParams', () => {
    const bare = route({ pathParams: undefined, rootPath: 'wheres-mobile-base' });
    const payload = { ignored: true };
    const result = applyPathParams(bare, 'https://game.test/wheres-mobile-base', payload);
    expect(result.url).toBe('https://game.test/wheres-mobile-base');
    expect(result.residualPayload).toBe(payload);
  });

  test('throws when a path param is missing', () => {
    expect(() => applyPathParams(route(), 'https://game.test/api/players/{name}', {})).toThrow(
      'Missing path parameter: name',
    );
  });

  test('throws when a path param is null', () => {
    expect(() => applyPathParams(route(), 'https://game.test/api/players/{name}', { name: null })).toThrow(
      'Missing path parameter: name',
    );
  });

  test('throws when a path param is empty string', () => {
    expect(() => applyPathParams(route(), 'https://game.test/api/players/{name}', { name: '' })).toThrow(
      'Missing path parameter: name',
    );
  });
});
