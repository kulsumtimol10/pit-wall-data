import { describe, expect, it } from 'vitest';
import { groupEvents, outlinePath, raceRounds } from '../src/lib/catalog';
import type { SessionFile } from '../src/types';

describe('raceRounds', () => {
  it('numbers race weekends in date order and skips testing', () => {
    const rounds = raceRounds([
      { meeting_key: 3, meeting_name: 'Chinese Grand Prix', date_start: '2025-03-21T03:30:00' },
      { meeting_key: 1, meeting_name: 'Pre-Season Testing', date_start: '2025-02-26T07:00:00' },
      { meeting_key: 2, meeting_name: 'Australian Grand Prix', date_start: '2025-03-14T01:30:00' },
    ]);
    expect([...rounds]).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  it('leaves out cancelled races, so later rounds move up', () => {
    const rounds = raceRounds([
      { meeting_key: 1, meeting_name: 'Japanese Grand Prix', date_start: '2026-03-27T02:30:00' },
      { meeting_key: 2, meeting_name: 'Bahrain Grand Prix', date_start: '2026-04-10T11:30:00', is_cancelled: true },
      { meeting_key: 3, meeting_name: 'Miami Grand Prix', date_start: '2026-05-01T16:30:00', is_cancelled: false },
    ]);
    expect([...rounds]).toEqual([
      [1, 1],
      [3, 2],
    ]);
  });
});

describe('outlinePath', () => {
  it('fits the track in the box, centred, north up', () => {
    // A 200 × 100 rectangle, wider than tall: it fills the width of a 56 × 38 box.
    const x = [0, 200, 200, 0];
    const y = [0, 0, 100, 100];
    expect(outlinePath(x, y, 56, 38, 4)).toBe('M0 33L56 33L56 5L0 5Z');
  });
});

describe('groupEvents', () => {
  const session = (key: number, meetingKey: number, year: number, date: string, name = 'Qualifying'): { file: string; data: SessionFile } => ({
    file: `sessions/${key}.json`,
    data: {
      version: 2,
      generatedAt: '',
      source: '',
      session: { key, meetingKey, year, meeting: `Meeting ${meetingKey}`, name, circuit: 'C', country: 'X', date },
      laps: [],
    },
  });

  it('groups sessions by weekend, newest season first and rounds in order', () => {
    const events = groupEvents(
      [session(30, 3, 2025, '2025-04-05T06:00:00Z'), session(90, 9, 2026, '2026-03-07T05:00:00Z'), session(20, 2, 2025, '2025-03-15T05:00:00Z')],
      new Map([
        [2, 1],
        [3, 2],
        [9, 1],
      ]),
      new Map([[2, 'M0 0Z']]),
    );
    expect(events.map((e) => [e.year, e.round, e.key])).toEqual([
      [2026, 1, 9],
      [2025, 1, 2],
      [2025, 2, 3],
    ]);
    expect(events[1].outline).toBe('M0 0Z');
    expect(events[1].sessions[0].file).toBe('sessions/20.json');
  });

  it('keeps a weekend with several sessions together, in date order', () => {
    const [event] = groupEvents(
      [session(31, 3, 2025, '2025-04-05T06:00:00Z'), session(29, 3, 2025, '2025-04-04T06:00:00Z', 'Sprint Qualifying')],
      new Map([[3, 4]]),
      new Map(),
    );
    expect(event.sessions.map((s) => s.name)).toEqual(['Sprint Qualifying', 'Qualifying']);
    expect(event.date).toBe('2025-04-04T06:00:00Z');
  });
});
