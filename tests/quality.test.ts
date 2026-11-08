import { describe, expect, it } from 'vitest';
import { lapProblem, longestFrozen, median } from '../src/lib/quality';
import type { LapSamples } from '../src/types';

/** A lap sampled every 0.25 s over `metres`, with telemetry that changes every sample. */
function lap(seconds: number, metres: number): LapSamples {
  const n = seconds * 4 + 1;
  const t = Array.from({ length: n }, (_, i) => i / 4);
  return {
    t,
    d: t.map((v) => (v / seconds) * metres),
    x: t.map(() => 0),
    y: t.map(() => 0),
    z: t.map(() => 0),
    speed: t.map((_, i) => 200 + (i % 7)),
    throttle: t.map((_, i) => 90 + (i % 5)),
    gear: t.map(() => 6),
    rpm: t.map((_, i) => 11000 + i),
    brake: t.map(() => 0),
  };
}

describe('longestFrozen', () => {
  it('is zero when the telemetry keeps changing', () => {
    expect(longestFrozen(lap(10, 1000))).toBe(0);
  });

  it('measures a stretch of identical readings', () => {
    const s = lap(20, 2000);
    for (let i = 20; i <= 40; i++) {
      s.speed[i] = 189;
      s.throttle[i] = 104;
      s.gear[i] = 4;
      s.rpm[i] = 9000;
    }
    expect(longestFrozen(s)).toBe(5);
  });
});

describe('lapProblem', () => {
  it('passes a sound lap', () => {
    expect(lapProblem(lap(90, 5440), 5440)).toBeNull();
    expect(lapProblem(lap(90, 5400), 5440)).toBeNull();
  });

  it('tolerates a dropout of a few seconds', () => {
    const s = lap(90, 5770);
    for (let i = 100; i <= 124; i++) {
      s.speed[i] = 308;
      s.throttle[i] = 104;
      s.gear[i] = 8;
      s.rpm[i] = 10602;
    }
    expect(lapProblem(s, 5770)).toBeNull();
  });

  it('flags telemetry that stops updating', () => {
    const s = lap(90, 5770);
    for (let i = 250; i < s.t.length; i++) {
      s.speed[i] = 189;
      s.throttle[i] = 104;
      s.gear[i] = 4;
      s.rpm[i] = 9000;
    }
    expect(lapProblem(s, 5770)).toBe('telemetry stops updating for 28 s');
  });

  it('flags positions that cut the lap short', () => {
    expect(lapProblem(lap(95, 5050), 5440)).toBe('positions trace 5.05 km, not the usual 5.44 km');
  });
});

describe('median', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
