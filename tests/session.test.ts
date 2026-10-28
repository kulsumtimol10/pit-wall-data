import { describe, expect, it } from 'vitest';
import type { OpenF1Lap, OpenF1SessionResult, OpenF1Stint } from '../src/lib/openf1';
import {
  bestSectors,
  byPosition,
  classificationRow,
  segmentOf,
  toUtcOffset,
  toWeather,
  tyreForLap,
} from '../src/lib/session';

const result = (over: Partial<OpenF1SessionResult> = {}): OpenF1SessionResult => ({
  driver_number: 81,
  position: 2,
  duration: [101.201, 100.626, 100.647],
  number_of_laps: 21,
  dnf: false,
  dns: false,
  dsq: false,
  ...over,
});

const lap = (s1: number | null, s2: number | null, s3: number | null): OpenF1Lap => ({
  driver_number: 4,
  lap_number: 1,
  date_start: null,
  lap_duration: null,
  is_pit_out_lap: false,
  duration_sector_1: s1,
  duration_sector_2: s2,
  duration_sector_3: s3,
  st_speed: null,
});

describe('segmentOf', () => {
  it('finds the segment whose official time the lap matches', () => {
    expect(segmentOf(result(), 100.626)).toBe('Q2');
    expect(segmentOf(result(), 100.647)).toBe('Q3');
  });
  it('returns null when nothing matches or the session is not qualifying', () => {
    expect(segmentOf(result(), 99)).toBeNull();
    expect(segmentOf(result({ duration: 5400.1 }), 5400.1)).toBeNull();
  });
});

describe('bestSectors', () => {
  it('takes the fastest time per sector and ignores gaps', () => {
    expect(bestSectors([lap(30.2, 42.5, null), lap(30.0, 43.1, 27.9), lap(null, 42.7, 28.1)])).toEqual([30.0, 42.5, 27.9]);
  });
  it('returns null for a sector nobody set', () => {
    expect(bestSectors([lap(null, 42.5, 28)])).toEqual([null, 42.5, 28]);
  });
});

describe('tyreForLap', () => {
  const stints: OpenF1Stint[] = [
    { driver_number: 4, stint_number: 1, lap_start: 1, lap_end: 3, compound: 'SOFT', tyre_age_at_start: 3 },
    { driver_number: 4, stint_number: 2, lap_start: 15, lap_end: 17, compound: 'SOFT', tyre_age_at_start: 0 },
  ];
  it('counts the out-lap, so a new set is one lap old on its first flying lap', () => {
    expect(tyreForLap(stints, 16)).toEqual({ compound: 'SOFT', age: 1, newSet: true });
  });
  it('carries over age from earlier sessions for a used set', () => {
    expect(tyreForLap(stints, 2)).toEqual({ compound: 'SOFT', age: 4, newSet: false });
  });
  it('returns null for a lap outside every stint', () => {
    expect(tyreForLap(stints, 9)).toBeNull();
  });
});

describe('classificationRow / byPosition', () => {
  const driver = { number: 81, code: 'PIA', name: 'Oscar PIASTRI', team: 'McLaren', teamColour: 'F47600' };
  it('keeps one time per qualifying segment', () => {
    const row = classificationRow(result({ duration: [101.2, null, null], dnf: true }), driver);
    expect(row.times).toEqual([101.2, null, null]);
    expect(row.status).toBe('DNF');
  });
  it('sorts unclassified drivers last', () => {
    const rows = [{ position: null }, { position: 2 }, { position: 1 }];
    expect(rows.sort(byPosition).map((r) => r.position)).toEqual([1, 2, null]);
  });
});

describe('toWeather / toUtcOffset', () => {
  it('maps OpenF1 weather fields', () => {
    const w = toWeather({
      date: '2025-07-26T14:50:56.000000+00:00',
      air_temperature: 23,
      track_temperature: 39.6,
      humidity: 52,
      pressure: 967.8,
      rainfall: 0,
      wind_direction: 342,
      wind_speed: 1.3,
    });
    expect(w).toMatchObject({ date: '2025-07-26T14:50:56.000Z', trackTemp: 39.6, rainfall: false, windDirection: 342 });
  });
  it('formats UTC offsets', () => {
    expect(toUtcOffset('02:00:00')).toBe('+02:00');
    expect(toUtcOffset('-05:00:00')).toBe('-05:00');
    expect(toUtcOffset(null)).toBeUndefined();
  });
});
