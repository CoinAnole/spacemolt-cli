import { describe, expect, test } from 'bun:test';
import { parseArgs } from './report-openapi-consistency';

describe('report-openapi-consistency args', () => {
  test('component prose scan is off by default', () => {
    expect(parseArgs([])).toMatchObject({
      json: false,
      includeLow: false,
      includeComponentProse: false,
    });
  });

  test('parses include-component-prose with existing flags', () => {
    expect(parseArgs(['--only', 'V2Response,repair', '--include-component-prose', '--include-low', '--json'])).toEqual({
      only: ['V2Response', 'repair'],
      json: true,
      includeLow: true,
      includeComponentProse: true,
    });
  });

  test('parses high-recall as an include-low alias', () => {
    expect(parseArgs(['--high-recall'])).toMatchObject({
      json: false,
      includeLow: true,
      includeComponentProse: false,
    });
  });
});
