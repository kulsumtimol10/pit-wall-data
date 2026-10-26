/** Index of the last element of an ascending array that is <= value, or -1 if there is none. */
export function floorIndex(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Linear interpolation of values sampled at ascending times; clamps outside the range. */
export function interpolateAt(times: number[], values: number[], t: number): number {
  const n = times.length;
  if (n === 0) throw new Error('interpolateAt: no samples');
  if (t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  const i = floorIndex(times, t);
  const t0 = times[i];
  const t1 = times[i + 1];
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** The most recent value at time t (for values that jump, like gear); clamps outside the range. */
export function stepAt(times: number[], values: number[], t: number): number {
  if (times.length === 0) throw new Error('stepAt: no samples');
  return values[Math.max(0, floorIndex(times, t))];
}

/** Running 3D distance along a path, starting at 0. */
export function cumulativeDistance(xs: number[], ys: number[], zs: number[]): number[] {
  const d = [0];
  for (let i = 1; i < xs.length; i++) {
    d.push(d[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1], zs[i] - zs[i - 1]));
  }
  return d;
}

export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
