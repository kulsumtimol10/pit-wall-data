// Builds the index that lists every published session, grouped by race
// weekend. Pure functions, so they are easy to test.

import type { EventSummary, SessionFile } from '../types';
import { round } from './geometry';

/** Width and height of the box circuit outlines are fitted into. */
export const OUTLINE_BOX = { width: 56, height: 38 };

/**
 * Round numbers for a season's Grands Prix, by meeting key, in date order.
 * Testing and cancelled races don't count, so later rounds move up, as in
 * the official calendar.
 */
export function raceRounds(
  meetings: { meeting_key: number; meeting_name: string; date_start: string; is_cancelled?: boolean }[],
): Map<number, number> {
  const races = meetings
    .filter((m) => /grand prix/i.test(m.meeting_name) && !m.is_cancelled)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));
  return new Map(races.map((m, i) => [m.meeting_key, i + 1]));
}

/**
 * A lap's track as an SVG path fitted (and centred) in a width × height box,
 * north up, using about `points` points.
 */
export function outlinePath(x: number[], y: number[], width: number, height: number, points = 48): string {
  const step = Math.max(1, Math.floor(x.length / points));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < x.length; i += step) {
    xs.push(x[i]);
    ys.push(-y[i]);
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = Math.min(width / spanX, height / spanY);
  const ox = (width - spanX * scale) / 2;
  const oy = (height - spanY * scale) / 2;
  return (
    xs.map((v, i) => `${i ? 'L' : 'M'}${round(ox + (v - minX) * scale, 1)} ${round(oy + (ys[i] - minY) * scale, 1)}`).join('') + 'Z'
  );
}

/**
 * Groups published sessions into race weekends: newest season first, rounds
 * in order within it, each weekend's sessions in date order.
 */
export function groupEvents(
  sessions: { file: string; data: SessionFile }[],
  rounds: Map<number, number>,
  outlines: Map<number, string>,
): EventSummary[] {
  const events = new Map<number, EventSummary>();
  for (const { file, data } of sessions) {
    const s = data.session;
    const key = s.meetingKey ?? s.key;
    const event = events.get(key) ?? {
      key,
      year: s.year,
      round: rounds.get(key) ?? 0,
      meeting: s.meeting,
      circuit: s.circuit,
      country: s.country,
      date: s.date,
      outline: outlines.get(key),
      sessions: [],
    };
    event.sessions.push({ ...s, file, drivers: data.laps.map((l) => l.driver.code) });
    if (s.date < event.date) event.date = s.date;
    events.set(key, event);
  }
  for (const e of events.values()) e.sessions.sort((a, b) => a.date.localeCompare(b.date));
  return [...events.values()].sort((a, b) => b.year - a.year || a.round - b.round || a.date.localeCompare(b.date));
}
