// Catches laps whose source data is broken, so they are left out rather than
// replayed wrongly. OpenF1 occasionally freezes a car's telemetry (the same
// speed, throttle, gear and RPM repeated, often with throttle at the invalid
// value 104) or sends positions that don't trace the circuit. Pure
// functions, so they are easy to test.

import type { LapSamples } from '../types';

/**
 * Telemetry that repeats exactly for longer than this has stopped updating.
 * Dropouts of a few seconds are common in 2026 data and barely show in a
 * replay; the broken laps freeze for 20 seconds or more.
 */
const FROZEN_S = 10;
/**
 * A lap's traced distance may differ this much from the session's typical lap.
 * Sound laps stay within 1.5%; laps with broken positions are 3% or more off.
 */
const DISTANCE_TOLERANCE = 0.025;

/** Seconds of the longest stretch where speed, throttle, gear and RPM all stay exactly the same. */
export function longestFrozen(s: LapSamples): number {
  let longest = 0;
  let start = 0;
  for (let i = 1; i < s.t.length; i++) {
    const same =
      s.speed[i] === s.speed[i - 1] && s.throttle[i] === s.throttle[i - 1] && s.gear[i] === s.gear[i - 1] && s.rpm[i] === s.rpm[i - 1];
    if (same) longest = Math.max(longest, s.t[i] - s.t[start]);
    else start = i;
  }
  return longest;
}

export const lapMetres = (s: LapSamples) => s.d[s.d.length - 1];

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Why a lap can't be replayed, or null when its data looks sound.
 * `typicalMetres` is the median traced distance of the session's laps.
 */
export function lapProblem(s: LapSamples, typicalMetres: number): string | null {
  const frozen = longestFrozen(s);
  if (frozen > FROZEN_S) return `telemetry stops updating for ${frozen.toFixed(0)} s`;
  const metres = lapMetres(s);
  if (Math.abs(metres / typicalMetres - 1) > DISTANCE_TOLERANCE) {
    return `positions trace ${(metres / 1000).toFixed(2)} km, not the usual ${(typicalMetres / 1000).toFixed(2)} km`;
  }
  return null;
}
