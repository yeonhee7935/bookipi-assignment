import { describe, expect, it } from 'vitest';
import { formatDate, formatTime, timeLeft } from './time';

const now = Date.parse('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(now + ms);

describe('timeLeft', () => {
  it('breaks short durations into units', () => {
    expect(timeLeft(at((1 * 3600 + 2 * 60 + 3) * 1000), now)).toEqual({
      kind: 'countdown',
      days: 0,
      hours: 1,
      minutes: 2,
      seconds: 3,
    });
  });

  it('includes days up to a week', () => {
    expect(timeLeft(at(7 * 24 * 3600 * 1000), now)).toMatchObject({ kind: 'countdown', days: 7, hours: 0 });
  });

  it('switches to a date beyond a week instead of counting thousands of days', () => {
    const target = new Date('2030-01-01T00:00:00Z');
    expect(timeLeft(target, now)).toEqual({ kind: 'date', date: target });
  });

  it('never goes negative', () => {
    expect(timeLeft(at(-5000), now)).toMatchObject({ kind: 'countdown', days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('formatting', () => {
  // Intl may use narrow no-break spaces; compare with plain spaces.
  const plain = (s: string) => s.replace(/\s/g, ' ');
  const opening = new Date('2026-11-30T22:00:00Z');

  it('shows the same instant in each viewer\'s local time, with the zone', () => {
    expect(plain(formatDate(opening, 'Asia/Seoul'))).toBe('1 Dec 2026, 7:00 am GMT+9');
    expect(plain(formatDate(opening, 'Australia/Sydney'))).toBe('1 Dec 2026, 9:00 am AEDT');
  });

  it("defaults to the viewer's time zone (tests run in New York)", () => {
    expect(plain(formatDate(opening))).toBe('30 Nov 2026, 5:00 pm GMT-5');
    expect(plain(formatTime(opening))).toBe('5:00:00 pm GMT-5');
  });
});
