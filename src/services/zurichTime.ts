/**
 * Utility functions for Switzerland (Europe/Zurich) timezone calculations.
 * Ensures daily quotas and scheduling strictly adhere to Zurich civil calendar days (midnight to midnight CET/CEST).
 */

const ZURICH_TZ = 'Europe/Zurich';

/**
 * Returns the calendar date string in YYYY-MM-DD format for a given date in Europe/Zurich timezone.
 */
export function getZurichDateString(date: Date | string | number = new Date()): string {
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    // Using en-CA locale formats as YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZURICH_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Returns a human-readable formatted date and time in Europe/Zurich timezone.
 */
export function formatZurichDateTime(date: Date | string | number = new Date()): string {
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('fr-CH', {
      timeZone: ZURICH_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(d);
  } catch (e) {
    return String(date);
  }
}

/**
 * Tests whether two dates fall on the same civil calendar day in Europe/Zurich.
 */
export function isSameZurichCalendarDay(dateA: Date | string | number, dateB: Date | string | number = new Date()): boolean {
  return getZurichDateString(dateA) === getZurichDateString(dateB);
}
