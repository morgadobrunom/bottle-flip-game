import { seedBottles } from '@bottle-flip/content';
import { describe, expect, it } from 'vitest';
import { formatCountdown, itemStatus, maskPhone, normalizeKenyanPhone, previousWindow, windowFor } from '../src';

const TZ = 'Africa/Nairobi';

describe('phone', () => {
  it('normalizes common Kenyan formats', () => {
    for (const input of ['0712345312', '712345312', '254712345312', '+254 712 345 312', '0712-345-312']) {
      expect(normalizeKenyanPhone(input)).toBe('+254712345312');
    }
    expect(normalizeKenyanPhone('0110123456')).toBe('+254110123456');
  });

  it('rejects non-mobile numbers', () => {
    for (const input of ['0201234567', '12345', '+1 415 555 0100', 'abcdefghi']) {
      expect(normalizeKenyanPhone(input)).toBeNull();
    }
  });

  it('masks numbers like the wireframes', () => {
    expect(maskPhone('+254712345312')).toBe('+254 7•• ••• 312');
  });
});

describe('periods', () => {
  // 2026-10-06 is a Tuesday. 23:30 UTC is already Wednesday 02:30 in Nairobi.
  const lateUtc = new Date('2026-10-06T23:30:00Z');

  it('uses Nairobi local days', () => {
    const w = windowFor('daily', lateUtc, TZ);
    expect(w.key).toBe('2026-10-07');
    expect(w.start.toISOString()).toBe('2026-10-06T21:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-07T21:00:00.000Z');
  });

  it('uses ISO weeks starting Monday local time', () => {
    const w = windowFor('weekly', lateUtc, TZ);
    expect(w.key).toBe('2026-W41');
    expect(w.start.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-11T21:00:00.000Z');
  });

  it('handles month and year rollover', () => {
    const w = windowFor('monthly', new Date('2026-12-31T22:00:00Z'), TZ);
    expect(w.key).toBe('2027-01');
    expect(previousWindow('monthly', new Date('2027-01-01T00:00:00Z'), TZ).key).toBe('2026-12');
    expect(windowFor('weekly', new Date('2027-01-01T12:00:00Z'), TZ).key).toBe('2026-W53');
  });

  it('formats countdowns like the wireframes', () => {
    expect(formatCountdown((2 * 24 + 14) * 3_600_000 + 5 * 60_000)).toBe('2d 14h');
    expect(formatCountdown(6 * 3_600_000 + 12 * 60_000)).toBe('6h 12m');
  });
});

describe('itemStatus', () => {
  const byId = (id: string) => seedBottles.find((b) => b.id === id)!;
  const ctx = { ownedIds: new Set<string>(), level: 1, equippedId: 'classic' };

  it('derives the customize grid states', () => {
    expect(itemStatus(byId('classic'), ctx)).toEqual({ status: 'equipped' });
    expect(itemStatus(byId('gold'), ctx)).toEqual({ status: 'buy', cost: 500 });
    expect(itemStatus(byId('mystery'), ctx)).toEqual({ status: 'level', level: 10 });
    expect(itemStatus(byId('brand-can'), ctx)).toEqual({ status: 'sponsored', missionId: 'weekly-data' });
    expect(itemStatus(byId('mystery'), { ...ctx, level: 10 })).toEqual({ status: 'owned' });
    expect(itemStatus(byId('gold'), { ...ctx, ownedIds: new Set(['gold']) })).toEqual({ status: 'owned' });
  });
});
