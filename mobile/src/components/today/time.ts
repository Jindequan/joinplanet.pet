/**
 * Today time helpers (spec §75 §76): every "now"/clock computation runs in the
 * circle's timezone, never the device's — Milo's 08:00 stays 08:00 Singapore.
 * Invalid/missing zones degrade to device-local dayjs (feedback never breaks).
 */
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

/** Current instant in the circle zone (device-local fallback). */
export function nowInZone(timezone?: string | null): dayjs.Dayjs {
  if (!timezone) return dayjs();
  try {
    return dayjs().tz(timezone);
  } catch {
    return dayjs();
  }
}

/** Circle-local YYYY-MM-DD for the today query + log dates (contract F4). */
export function todayInZone(timezone?: string | null): string {
  return nowInZone(timezone).format('YYYY-MM-DD');
}

/** ISO log timestamp → circle-local HH:mm. */
export function clockOf(iso: string, timezone?: string | null): string {
  if (!timezone) return dayjs(iso).format('HH:mm');
  try {
    return dayjs(iso).tz(timezone).format('HH:mm');
  } catch {
    return dayjs(iso).format('HH:mm');
  }
}

export type Daypart = 'morning' | 'afternoon' | 'evening';

/** Task daypart from its HH:mm time_of_day (spec §18): <12 / 12–17 / ≥17. */
export function daypartOf(timeOfDay: string): Daypart {
  const hour = Number.parseInt(timeOfDay.slice(0, 2), 10);
  const h = Number.isFinite(hour) ? hour : 0;
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export const DAYPART_ORDER: readonly Daypart[] = ['morning', 'afternoon', 'evening'];

export const DAYPART_LABEL: Record<Daypart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

/** Time-of-day greeting in the circle's clock (spec §83 — short, restrained). */
export function greetingFor(hour: number, petName: string): string {
  if (hour < 12) return `Good morning, ${petName}.`;
  if (hour < 17) return `Good afternoon, ${petName}.`;
  return `Good evening, ${petName}.`;
}
