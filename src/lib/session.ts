// Turns OpenF1 session-level data (results, laps, stints, weather) into the
// published format. Pure functions, so they are easy to test.

import type { ClassificationRow, DriverInfo, Sectors, Segment, Tyre, WeatherReading } from '../types';
import type { OpenF1Lap, OpenF1SessionResult, OpenF1Stint, OpenF1Weather } from './openf1';

const SEGMENTS: Segment[] = ['Q1', 'Q2', 'Q3'];
/** A lap matches an official time if it is within this many seconds. */
const MATCH_S = 0.002;

/** Which qualifying segment's official time a lap matches, or null (not qualifying, or no match). */
export function segmentOf(result: OpenF1SessionResult, lapTime: number): Segment | null {
  if (!Array.isArray(result.duration)) return null;
  const i = result.duration.findIndex((t) => typeof t === 'number' && Math.abs(t - lapTime) < MATCH_S);
  return i >= 0 && i < SEGMENTS.length ? SEGMENTS[i] : null;
}

export const lapSectors = (lap: OpenF1Lap): Sectors => [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3];

/** Fastest time in each sector across the given laps; null for a sector nobody has a time in. */
export function bestSectors(laps: OpenF1Lap[]): Sectors {
  const best = (i: 0 | 1 | 2) => {
    const times = laps.map((l) => lapSectors(l)[i]).filter((t): t is number => typeof t === 'number' && t > 0);
    return times.length ? Math.min(...times) : null;
  };
  return [best(0), best(1), best(2)];
}

/**
 * The tyre on the car for a lap, from that driver's stints. Age counts laps
 * already done on the set, including the out-lap, so a new set's first flying
 * lap is age 1. An unknown starting age is treated as 0.
 */
export function tyreForLap(stints: OpenF1Stint[], lapNumber: number): Tyre | null {
  const stint = stints.find(
    (s) => s.lap_start !== null && lapNumber >= s.lap_start && lapNumber <= (s.lap_end ?? Infinity),
  );
  if (!stint?.compound || stint.lap_start === null) return null;
  const startAge = stint.tyre_age_at_start ?? 0;
  return { compound: stint.compound, age: startAge + (lapNumber - stint.lap_start), newSet: startAge === 0 };
}

export function classificationRow(result: OpenF1SessionResult, driver: DriverInfo): ClassificationRow {
  const times = Array.isArray(result.duration) ? result.duration : [result.duration];
  return {
    position: result.position,
    driver,
    times: times.map((t) => (typeof t === 'number' ? t : null)),
    laps: result.number_of_laps ?? 0,
    status: result.dsq ? 'DSQ' : result.dns ? 'DNS' : result.dnf ? 'DNF' : null,
  };
}

/** Classified drivers first, in position order; unclassified ones after. */
export function byPosition<T extends { position: number | null }>(a: T, b: T): number {
  return (a.position ?? Infinity) - (b.position ?? Infinity);
}

export function toWeather(r: OpenF1Weather): WeatherReading {
  return {
    date: new Date(Date.parse(r.date)).toISOString(),
    airTemp: r.air_temperature,
    trackTemp: r.track_temperature,
    humidity: r.humidity,
    pressure: r.pressure,
    rainfall: r.rainfall > 0,
    windSpeed: r.wind_speed,
    windDirection: r.wind_direction,
  };
}

/** "02:00:00" → "+02:00", "-05:00:00" → "-05:00"; undefined if missing or unreadable. */
export function toUtcOffset(gmtOffset: string | null | undefined): string | undefined {
  const match = gmtOffset ? /^(-?)(\d{2}):(\d{2})/.exec(gmtOffset) : null;
  return match ? `${match[1] === '-' ? '-' : '+'}${match[2]}:${match[3]}` : undefined;
}
