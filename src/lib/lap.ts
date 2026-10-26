import type { LapSamples } from '../types';
import { cumulativeDistance, interpolateAt, round, stepAt } from './geometry';

/** OpenF1 positions are in tenths of a metre (checked against Spa: 102 m of elevation, ~7 km lap). */
export const OPENF1_UNITS_PER_METRE = 10;

/** Positions must reach this close (seconds) to the lap's start and end, or the lap is rejected. */
const MAX_EDGE_GAP_S = 1;

export interface PositionSample {
  ms: number;
  x: number;
  y: number;
  z: number;
}

export interface TelemetrySample {
  ms: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  rpm: number;
}

/**
 * Merges raw position and telemetry streams into one lap.
 * Samples are taken at each position reading inside the lap, plus exact
 * points at 0 and lapTime so every lap starts and ends on the line.
 * Pass readings from slightly before and after the lap for accurate edges.
 */
export function buildLapSamples(
  startMs: number,
  lapTime: number,
  positions: PositionSample[],
  telemetry: TelemetrySample[],
): LapSamples {
  if (positions.length < 2 || telemetry.length < 2) {
    throw new Error('buildLapSamples: not enough samples');
  }
  const pos = [...positions].sort((a, b) => a.ms - b.ms);
  const tel = [...telemetry].sort((a, b) => a.ms - b.ms);

  const pt = pos.map((p) => (p.ms - startMs) / 1000);
  const tt = tel.map((s) => (s.ms - startMs) / 1000);
  if (pt[0] > MAX_EDGE_GAP_S || pt[pt.length - 1] < lapTime - MAX_EDGE_GAP_S) {
    throw new Error(
      `buildLapSamples: positions cover ${pt[0].toFixed(2)}s to ${pt[pt.length - 1].toFixed(2)}s, lap is 0s to ${lapTime}s`,
    );
  }

  const px = pos.map((p) => p.x / OPENF1_UNITS_PER_METRE);
  const py = pos.map((p) => p.y / OPENF1_UNITS_PER_METRE);
  const pz = pos.map((p) => p.z / OPENF1_UNITS_PER_METRE);

  const times = [0, ...pt.filter((t) => t > 0 && t < lapTime), lapTime];
  const x = times.map((t) => interpolateAt(pt, px, t));
  const y = times.map((t) => interpolateAt(pt, py, t));
  const z = times.map((t) => interpolateAt(pt, pz, t));
  const d = cumulativeDistance(x, y, z);

  const speed = tel.map((s) => s.speed);
  const throttle = tel.map((s) => s.throttle);
  const brake = tel.map((s) => s.brake);
  const gear = tel.map((s) => s.gear);
  const rpm = tel.map((s) => s.rpm);

  return {
    t: times.map((t) => round(t, 3)),
    d: d.map((v) => round(v, 1)),
    x: x.map((v) => round(v, 1)),
    y: y.map((v) => round(v, 1)),
    z: z.map((v) => round(v, 1)),
    speed: times.map((t) => Math.round(interpolateAt(tt, speed, t))),
    throttle: times.map((t) => Math.round(interpolateAt(tt, throttle, t))),
    brake: times.map((t) => stepAt(tt, brake, t)),
    gear: times.map((t) => stepAt(tt, gear, t)),
    rpm: times.map((t) => Math.round(interpolateAt(tt, rpm, t))),
  };
}
