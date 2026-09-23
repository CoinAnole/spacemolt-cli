const MAX_SAFE_DIGITS = '9007199254740991';
const INTEGER_TOKEN = /^-?(?:0|[1-9]\d+)$/;

export function isUnsafeIntegerToken(source: string): boolean {
  if (!INTEGER_TOKEN.test(source)) return false;
  const digits = source.charCodeAt(0) === 45 /* '-' */ ? source.slice(1) : source;
  if (digits.length < MAX_SAFE_DIGITS.length) return false;
  if (digits.length > MAX_SAFE_DIGITS.length) return true;
  return digits > MAX_SAFE_DIGITS; // equal length, no leading zeros
}

type ParseContext = { source?: string };

export class UnsafeIntegerSourceError extends Error {
  constructor() {
    super('JSON parser did not provide number source text; refusing to round an integer outside the safe range.');
    this.name = 'UnsafeIntegerSourceError';
  }
}

export function parseApiJson(text: string): unknown {
  // Installed TypeScript 5.9.3 types JSON.parse's reviver as
  // (this: any, key: string, value: any) => any. The third argument is not in lib.es5.d.ts.
  const reviver = ((_key: string, value: unknown, context?: ParseContext) => {
    const source = context?.source;
    if (typeof value === 'number' && typeof source === 'string' && isUnsafeIntegerToken(source)) {
      return BigInt(source);
    }
    if (typeof value === 'number' && typeof source !== 'string' && losesIntegerText(value)) {
      throw new UnsafeIntegerSourceError();
    }
    return value;
  }) as (this: unknown, key: string, value: unknown) => unknown;
  return JSON.parse(text, reviver);
}

export function losesIntegerText(value: number): boolean {
  // Infinity: a long digit token on an engine that dropped `source` (Number.isInteger is false).
  if (!Number.isFinite(value)) return true;
  return Number.isInteger(value) && !Number.isSafeInteger(value);
}

function rawJsonNumber(digits: string): unknown {
  // JSON.rawJSON is in Bun 1.4.2 and absent from TypeScript 5.9.3 and @types/bun 1.4.2.
  const rawJSON = (JSON as JSON & { rawJSON?: (text: string) => unknown }).rawJSON;
  if (!rawJSON) throw new Error('JSON.rawJSON is required to emit integers outside the safe range.');
  return rawJSON(digits);
}

export function stringifyApiJson(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, inner) => (typeof inner === 'bigint' ? rawJsonNumber(inner.toString()) : inner),
    space,
  );
}
