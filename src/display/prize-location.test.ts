import { expect, test } from 'bun:test';
import { formatPrizeCaptureLocation, formatPrizeCaptureSite, prizeFieldText } from './prize-location.ts';

test('omits non-strings, whitespace, and numbers', () => {
  expect(prizeFieldText(undefined)).toBeUndefined();
  expect(prizeFieldText(null)).toBeUndefined();
  expect(prizeFieldText(1)).toBeUndefined();
  expect(prizeFieldText(true)).toBeUndefined();
  expect(prizeFieldText({ id: 'prize-1' })).toBeUndefined();
  expect(prizeFieldText(['prize-1'])).toBeUndefined();
  expect(prizeFieldText('')).toBeUndefined();
  expect(prizeFieldText('   ')).toBeUndefined();
  expect(prizeFieldText(' prize-1 ')).toBe('prize-1');
});

test('names beat ids', () => {
  const data = {
    prize_id: 'prize-1',
    prize_poi_id: 'sol_cloudbank',
    prize_poi_name: 'Cloudbank',
    prize_system_id: 'sol',
    prize_system_name: 'Sol',
  };
  expect(formatPrizeCaptureSite(data)).toBe('prize prize-1 at Cloudbank (Sol)');
  expect(formatPrizeCaptureLocation(data)).toBe('Cloudbank (Sol)');
});

test('full names lock site and location strings', () => {
  const data = {
    prize_id: 'prize-1',
    prize_poi_id: 'sol_cloudbank',
    prize_poi_name: 'Cloudbank',
    prize_system_id: 'sol',
    prize_system_name: 'Sol',
  };
  expect(formatPrizeCaptureSite(data)).toBe('prize prize-1 at Cloudbank (Sol)');
  expect(formatPrizeCaptureLocation(data)).toBe('Cloudbank (Sol)');
});

test('ids only lock site and location strings', () => {
  const data = {
    prize_id: 'prize-1',
    prize_poi_id: 'sol_cloudbank',
    prize_system_id: 'sol',
  };
  expect(formatPrizeCaptureSite(data)).toBe('prize prize-1 at sol_cloudbank (sol)');
  expect(formatPrizeCaptureLocation(data)).toBe('sol_cloudbank (sol)');
});

test('hidden / in-transit system-only uses in for site and a preposition-free location', () => {
  const data = {
    prize_id: 'prize-1',
    prize_system_id: 'sol',
    prize_system_name: 'Sol',
  };
  expect(formatPrizeCaptureSite(data)).toBe('prize prize-1 in Sol');
  expect(formatPrizeCaptureLocation(data)).toBe('Sol');
  expect(formatPrizeCaptureLocation(data)).not.toContain('in ');
});

test('poi-only origin uses at for site and a preposition-free location', () => {
  const named = { prize_id: 'prize-1', prize_poi_name: 'Cloudbank' };
  expect(formatPrizeCaptureSite(named)).toBe('prize prize-1 at Cloudbank');
  expect(formatPrizeCaptureLocation(named)).toBe('Cloudbank');

  const idOnly = { prize_id: 'prize-1', prize_poi_id: 'sol_cloudbank' };
  expect(formatPrizeCaptureSite(idOnly)).toBe('prize prize-1 at sol_cloudbank');
  expect(formatPrizeCaptureLocation(idOnly)).toBe('sol_cloudbank');
});

test('prize_id only has no location column', () => {
  expect(formatPrizeCaptureSite({ prize_id: 'prize-1' })).toBe('prize prize-1');
  expect(formatPrizeCaptureLocation({ prize_id: 'prize-1' })).toBeUndefined();
});

test('location only is compact and preposition-free', () => {
  const names = { prize_poi_name: 'Cloudbank', prize_system_name: 'Sol' };
  expect(formatPrizeCaptureSite(names)).toBe('Cloudbank (Sol)');
  expect(formatPrizeCaptureLocation(names)).toBe('Cloudbank (Sol)');
  expect(formatPrizeCaptureSite(names)).not.toMatch(/\bat\b|\bin\b/);
  expect(formatPrizeCaptureSite(names)).not.toContain('prize ');

  const ids = { prize_poi_id: 'sol_cloudbank', prize_system_id: 'sol' };
  expect(formatPrizeCaptureSite(ids)).toBe('sol_cloudbank (sol)');
  expect(formatPrizeCaptureLocation(ids)).toBe('sol_cloudbank (sol)');

  const systemOnly = { prize_system_name: 'Sol' };
  expect(formatPrizeCaptureSite(systemOnly)).toBe('Sol');
  expect(formatPrizeCaptureLocation(systemOnly)).toBe('Sol');
});

test('no prize fields is undefined', () => {
  expect(formatPrizeCaptureSite({})).toBeUndefined();
  expect(formatPrizeCaptureLocation({})).toBeUndefined();
  expect(formatPrizeCaptureSite({ ship_class: 'skiff', captor_username: 'Marlowe' })).toBeUndefined();
  expect(formatPrizeCaptureLocation({ prize_id: 1, prize_poi_name: 'Cloudbank' })).toBe('Cloudbank');
  expect(formatPrizeCaptureSite({ prize_id: '  ', prize_poi_name: '  ' })).toBeUndefined();
});
