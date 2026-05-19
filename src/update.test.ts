import { describe, expect, test } from 'bun:test';
import { compareVersions } from './client';

describe('compareVersions', () => {
  test('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.6.5', '0.6.5')).toBe(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  test('returns 1 when latest is newer (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(1);
    expect(compareVersions('0.6.5', '1.0.0')).toBe(1);
  });

  test('returns 1 when latest is newer (minor)', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(1);
    expect(compareVersions('0.6.5', '0.7.0')).toBe(1);
  });

  test('returns 1 when latest is newer (patch)', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(1);
    expect(compareVersions('0.6.5', '0.6.6')).toBe(1);
  });

  test('returns -1 when current is newer', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(-1);
  });

  test('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1', '1.0')).toBe(-1);
  });

  test('handles v prefix', () => {
    expect(compareVersions('v0.6.5', 'v0.6.6')).toBe(1);
    expect(compareVersions('0.6.5', 'v0.6.6')).toBe(1);
    expect(compareVersions('v0.6.5', '0.6.6')).toBe(1);
  });
});
