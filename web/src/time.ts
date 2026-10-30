const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Beyond this, a ticking countdown is noise; we show the date instead. */
const COUNTDOWN_LIMIT = 7 * DAY;

export type TimeLeft =
  | { kind: 'countdown'; days: number; hours: number; minutes: number; seconds: number }
  | { kind: 'date'; date: Date };

export function timeLeft(target: Date, now: number): TimeLeft {
  const ms = Math.max(0, target.getTime() - now);
  if (ms > COUNTDOWN_LIMIT) return { kind: 'date', date: target };
  return {
    kind: 'countdown',
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / HOUR),
    minutes: Math.floor((ms % HOUR) / MINUTE),
    seconds: Math.floor((ms % MINUTE) / SECOND),
  };
}

/**
 * Times are shown in the viewer's own time zone, always with the zone name, so a
 * visitor in Seoul and one in Sydney see the same instant in their local terms
 * ("7:00 am GMT+9" / "9:00 am AEDT"). The data itself is UTC end to end; the zone
 * is purely a presentation choice. English (en-AU, day-month order) everywhere.
 */
const LOCALE = 'en-AU';

/** `timeZone` defaults to the viewer's; tests pass one explicitly. */
export function formatDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function formatTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
