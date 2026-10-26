import { describe, expect, it } from 'vitest';
import { cumulativeDistance, floorIndex, interpolateAt, stepAt } from '../src/lib/geometry';
import { buildLapSamples } from '../src/lib/lap';

describe('floorIndex', () => {
  const xs = [0, 1, 2, 3];
  it('finds the last element <= value', () => {
    expect(floorIndex(xs, 1.5)).toBe(1);
    expect(floorIndex(xs, 2)).toBe(2);
    expect(floorIndex(xs, 10)).toBe(3);
  });
  it('returns -1 before the first element', () => {
    expect(floorIndex(xs, -1)).toBe(-1);
  });
});

describe('interpolateAt', () => {
  const t = [0, 1, 3];
  const v = [10, 20, 0];
  it('interpolates between samples', () => {
    expect(interpolateAt(t, v, 0.5)).toBe(15);
    expect(interpolateAt(t, v, 2)).toBe(10);
  });
  it('clamps outside the range', () => {
    expect(interpolateAt(t, v, -5)).toBe(10);
    expect(interpolateAt(t, v, 9)).toBe(0);
  });
});

describe('stepAt', () => {
  it('holds the previous value', () => {
    expect(stepAt([0, 1, 2], [3, 4, 5], 1.9)).toBe(4);
    expect(stepAt([0, 1, 2], [3, 4, 5], -1)).toBe(3);
  });
});

describe('cumulativeDistance', () => {
  it('adds up 3D segment lengths', () => {
    expect(cumulativeDistance([0, 3, 3], [0, 4, 4], [0, 0, 2])).toEqual([0, 5, 7]);
  });
});

describe('buildLapSamples', () => {
  // A car moving along x at 10 m/s (100 OpenF1 units/s), readings every 0.25 s from -1 s to 11 s.
  const start = 1_000_000;
  const readings = Array.from({ length: 49 }, (_, i) => -1 + i * 0.25);
  const positions = readings.map((t) => ({ ms: start + t * 1000, x: t * 100, y: 0, z: 0 }));
  const telemetry = readings.map((t) => ({
    ms: start + t * 1000 + 50,
    speed: 36,
    throttle: 100,
    brake: 0,
    gear: t < 5 ? 3 : 4,
    rpm: 10000,
  }));
  const lap = buildLapSamples(start, 10, positions, telemetry);

  it('starts at 0 s and ends exactly at the lap time', () => {
    expect(lap.t[0]).toBe(0);
    expect(lap.t[lap.t.length - 1]).toBe(10);
  });
  it('converts OpenF1 units to metres', () => {
    expect(lap.x[0]).toBe(0);
    expect(lap.x[lap.x.length - 1]).toBe(100);
    expect(lap.d[lap.d.length - 1]).toBe(100);
  });
  it('keeps every channel the same length', () => {
    const n = lap.t.length;
    for (const channel of Object.values(lap)) expect(channel).toHaveLength(n);
  });
  it('steps gear instead of interpolating it', () => {
    expect(new Set(lap.gear)).toEqual(new Set([3, 4]));
  });
  it('rejects a lap the positions do not cover', () => {
    expect(() => buildLapSamples(start, 30, positions, telemetry)).toThrow(/positions cover/);
  });
});
