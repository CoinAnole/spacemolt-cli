import { describe, expect, test } from 'bun:test';
import { losesIntegerText, parseApiJson, stringifyApiJson, UnsafeIntegerSourceError } from './json-number.ts';

const MAX_SAFE = '9007199254740991';
const TWO_POW_53 = '9007199254740992';
const TWO_POW_53_PLUS = '9007199254740993';

function parseRecordingSource(text: string): { value: unknown; source: string | undefined } {
  let source: string | undefined;
  const reviver = ((_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value === 'number') source = context?.source;
    return value;
  }) as (this: unknown, key: string, value: unknown) => unknown;
  return { value: JSON.parse(text, reviver), source };
}

describe('parseApiJson', () => {
  test('keeps safe integers as numbers and re-emits the same digits', () => {
    for (const token of ['42', '0', MAX_SAFE, `-${MAX_SAFE}`]) {
      const parsed = parseApiJson(token);
      expect(typeof parsed).toBe('number');
      expect(parsed).toBe(Number(token));
      expect(stringifyApiJson(parsed)).toBe(token);
    }
  });

  test('keeps -0 as a number and re-emits 0', () => {
    const parsed = parseApiJson('-0');
    expect(typeof parsed).toBe('number');
    expect(Object.is(parsed, -0)).toBe(true);
    expect(stringifyApiJson(parsed)).toBe('0');
    expect(stringifyApiJson(-0)).toBe('0');
  });

  test('turns 2^53, 2^53 + 1, and the negative into bigint and re-emits exact digits', () => {
    expect(parseApiJson(TWO_POW_53)).toBe(BigInt(TWO_POW_53));
    expect(parseApiJson(TWO_POW_53_PLUS)).toBe(BigInt(TWO_POW_53_PLUS));
    expect(parseApiJson(`-${TWO_POW_53_PLUS}`)).toBe(BigInt(`-${TWO_POW_53_PLUS}`));
    expect(stringifyApiJson(parseApiJson(TWO_POW_53))).toBe(TWO_POW_53);
    expect(stringifyApiJson(parseApiJson(TWO_POW_53_PLUS))).toBe(TWO_POW_53_PLUS);
    expect(stringifyApiJson(parseApiJson(`-${TWO_POW_53_PLUS}`))).toBe(`-${TWO_POW_53_PLUS}`);
    expect(stringifyApiJson(BigInt(TWO_POW_53_PLUS))).toBe(TWO_POW_53_PLUS);
    expect(stringifyApiJson(BigInt(`-${TWO_POW_53_PLUS}`))).toBe(`-${TWO_POW_53_PLUS}`);
  });

  test('leaves digit strings as strings', () => {
    const parsed = parseApiJson(`"${TWO_POW_53_PLUS}"`);
    expect(parsed).toBe(TWO_POW_53_PLUS);
    expect(typeof parsed).toBe('string');
    expect(stringifyApiJson(parsed)).toBe(`"${TWO_POW_53_PLUS}"`);
  });

  test('leaves fractional tokens and exponents as numbers', () => {
    for (const token of ['1.5', '1.0', `${TWO_POW_53_PLUS}.0`, '1e20', '1e21']) {
      const parsed = parseApiJson(token);
      const native = JSON.parse(token) as number;
      expect(typeof parsed).toBe('number');
      expect(parsed).toBe(native);
      expect(stringifyApiJson(parsed)).toBe(JSON.stringify(native));
    }
  });

  test('rejects invalid leading-zero integers', () => {
    expect(() => parseApiJson('01')).toThrow(SyntaxError);
  });

  test('duplicate keys last-win using the source of the winner', () => {
    const winner = parseApiJson(`{"dup":1,"dup":${TWO_POW_53_PLUS}}`) as { dup: unknown };
    expect(winner.dup).toBe(BigInt(TWO_POW_53_PLUS));
    expect(stringifyApiJson(winner)).toBe(`{"dup":${TWO_POW_53_PLUS}}`);

    const earlier = parseApiJson(`{"dup":${TWO_POW_53_PLUS},"dup":1}`) as { dup: unknown };
    expect(earlier.dup).toBe(1);
    expect(typeof earlier.dup).toBe('number');
    expect(stringifyApiJson(earlier)).toBe('{"dup":1}');
  });

  test('preserves child bigints in nested objects and arrays', () => {
    const text = `{"ship":{"credits":${TWO_POW_53_PLUS},"safe":${MAX_SAFE}},"holds":[42,-${TWO_POW_53_PLUS},{"fee":${TWO_POW_53}}]}`;
    const parsed = parseApiJson(text) as {
      ship: { credits: unknown; safe: unknown };
      holds: [unknown, unknown, { fee: unknown }];
    };
    expect(parsed.ship.credits).toBe(BigInt(TWO_POW_53_PLUS));
    expect(parsed.ship.safe).toBe(Number(MAX_SAFE));
    expect(typeof parsed.ship.safe).toBe('number');
    expect(parsed.holds[0]).toBe(42);
    expect(parsed.holds[1]).toBe(BigInt(`-${TWO_POW_53_PLUS}`));
    expect(parsed.holds[2].fee).toBe(BigInt(TWO_POW_53));
    expect(stringifyApiJson(parsed)).toBe(text);
  });

  test('ignores whitespace around an unsafe integer token', () => {
    const recorded = parseRecordingSource(' \n\t9007199254740993 \n');
    expect(recorded.source).toBe(TWO_POW_53_PLUS);
    expect(recorded.source?.includes(' ')).toBe(false);

    const parsed = parseApiJson(' { "credits" : 9007199254740993 } ') as { credits: unknown };
    expect(parsed.credits).toBe(BigInt(TWO_POW_53_PLUS));
    expect(stringifyApiJson(parsed)).toBe(`{"credits":${TWO_POW_53_PLUS}}`);
  });

  test('preserves a 40-digit integer token', () => {
    const digits = '1234567890123456789012345678901234567890';
    expect(digits.length).toBe(40);
    expect(parseApiJson(digits)).toBe(BigInt(digits));
    expect(stringifyApiJson(parseApiJson(digits))).toBe(digits);
  });

  test('preserves a digit token that native JSON.parse turns into Infinity', () => {
    const digits = '9'.repeat(401);
    expect(JSON.parse(digits)).toBe(Number.POSITIVE_INFINITY);
    const parsed = parseApiJson(digits);
    expect(typeof parsed).toBe('bigint');
    expect(parsed).toBe(BigInt(digits));
    expect(stringifyApiJson(parsed)).toBe(digits);
  });
});

describe('losesIntegerText', () => {
  test('is true for Infinity and for an integer outside the safe range', () => {
    expect(losesIntegerText(Number.POSITIVE_INFINITY)).toBe(true);
    expect(losesIntegerText(9007199254740992)).toBe(true);
  });

  test('is false for a safe integer and for a fraction', () => {
    expect(losesIntegerText(42)).toBe(false);
    expect(losesIntegerText(9007199254740991)).toBe(false);
    expect(losesIntegerText(1.5)).toBe(false);
  });
});

describe('UnsafeIntegerSourceError', () => {
  test('names the missing number source', () => {
    const error = new UnsafeIntegerSourceError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UnsafeIntegerSourceError);
    expect(error.name).toBe('UnsafeIntegerSourceError');
    expect(error.message).toBe(
      'JSON parser did not provide number source text; refusing to round an integer outside the safe range.',
    );
  });
});

describe('stringifyApiJson', () => {
  test('matches JSON.stringify for a mixed object with no bigint', () => {
    const mixed = {
      id: 'ship-1',
      fuel: 40,
      docked: false,
      cargo: ['ore', null, 1.5],
      meta: { count: 0, ready: true },
    };
    expect(stringifyApiJson(mixed)).toBe(JSON.stringify(mixed));
    expect(stringifyApiJson(mixed, 2)).toBe(JSON.stringify(mixed, null, 2));
  });

  test('pretty-prints bigint digits without quotes', () => {
    expect(stringifyApiJson({ credits: BigInt(TWO_POW_53_PLUS), fuel: 40 }, 2)).toBe(
      `{\n  "credits": ${TWO_POW_53_PLUS},\n  "fuel": 40\n}`,
    );
  });
});

describe('JSON.parse reviver source', () => {
  test('receives context.source for a number', () => {
    const recorded = parseRecordingSource('42');
    expect(typeof recorded.source).toBe('string');
    expect(recorded.source).toBe('42');
    expect(recorded.value).toBe(42);
  });
});
