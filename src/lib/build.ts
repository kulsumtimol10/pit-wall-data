// Builds a session's files from OpenF1, and the index that lists every
// published session. Everything goes under out/v2/:
//
//   sessions/<session_key>.json          every driver's fastest lap (times,
//                                        sectors, tyres), the classification
//                                        and the weather, without telemetry
//   laps/<session_key>/<driver_no>.json  one lap's telemetry
//   index.json                           every session, by race weekend

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { groupEvents, OUTLINE_BOX, outlinePath, raceRounds } from './catalog';
import { buildLapSamples } from './lap';
import { lapMetres, lapProblem, median } from './quality';
import {
  get,
  toQueryDate,
  type OpenF1CarData,
  type OpenF1Driver,
  type OpenF1Lap,
  type OpenF1Location,
  type OpenF1Meeting,
  type OpenF1Session,
  type OpenF1SessionResult,
  type OpenF1Stint,
  type OpenF1Weather,
} from './openf1';
import {
  bestSectors,
  byPosition,
  classificationRow,
  lapSectors,
  positionOf,
  segmentOf,
  toUtcOffset,
  toWeather,
  tyreForLap,
} from './session';
import {
  DATA_VERSION,
  type DataIndex,
  type DriverInfo,
  type LapData,
  type LapFile,
  type LapSummary,
  type SessionFile,
  type SessionInfo,
} from '../types';

/** Extra seconds of readings fetched either side of a lap, so its edges interpolate cleanly. */
const EDGE_MARGIN_MS = 2000;
/** A lap matches the official best time if it is within this many seconds. */
const TIME_MATCH_S = 0.002;
const SOURCE = 'OpenF1 (openf1.org), CC BY-NC-SA 4.0';

/** The folder this version of the format is published in, e.g. out/v2. */
export const versionDir = (outDir: string) => join(outDir, `v${DATA_VERSION}`);

/** Best official time from a session result: the fastest of Q1/Q2/Q3, or the single duration. */
function officialBest(result: OpenF1SessionResult): number | null {
  const times = (Array.isArray(result.duration) ? result.duration : [result.duration]).filter(
    (t): t is number => typeof t === 'number',
  );
  return times.length ? Math.min(...times) : null;
}

/** The lap that set the official best time; falls back to the fastest timed lap. */
function pickLap(laps: OpenF1Lap[], best: number | null): OpenF1Lap {
  const timed = laps.filter((l) => l.lap_duration !== null && l.date_start !== null && !l.is_pit_out_lap);
  if (timed.length === 0) throw new Error('no timed laps');
  const matching = best === null ? undefined : timed.find((l) => Math.abs(l.lap_duration! - best) < TIME_MATCH_S);
  return matching ?? timed.reduce((a, b) => (b.lap_duration! < a.lap_duration! ? b : a));
}

function driverInfo(driver: OpenF1Driver): DriverInfo {
  return {
    number: driver.driver_number,
    code: driver.name_acronym,
    name: driver.full_name,
    team: driver.team_name,
    teamColour: driver.team_colour ?? '888888',
  };
}

async function buildLap(
  sessionKey: number,
  result: OpenF1SessionResult,
  driver: OpenF1Driver,
  laps: OpenF1Lap[],
  stints: OpenF1Stint[],
): Promise<LapData> {
  const best = officialBest(result);
  if (best === null) throw new Error('no official lap time');
  const lap = pickLap(laps, best);
  const lapTime = lap.lap_duration!;
  if (Math.abs(lapTime - best) >= TIME_MATCH_S) {
    console.warn(`  ! ${driver.name_acronym}: no lap matches the official ${best}s, using ${lapTime}s`);
  }

  const startMs = Date.parse(lap.date_start!);
  const endMs = startMs + lapTime * 1000;
  const window = [
    `session_key=${sessionKey}`,
    `driver_number=${driver.driver_number}`,
    `date>=${toQueryDate(startMs - EDGE_MARGIN_MS)}`,
    `date<=${toQueryDate(endMs + EDGE_MARGIN_MS)}`,
  ];
  const locations = await get<OpenF1Location>('location', window);
  const carData = await get<OpenF1CarData>('car_data', window);

  const samples = buildLapSamples(
    startMs,
    lapTime,
    locations.map((p) => ({ ms: Date.parse(p.date), x: p.x, y: p.y, z: p.z })),
    carData.map((c) => ({
      ms: Date.parse(c.date),
      speed: c.speed,
      throttle: c.throttle,
      brake: c.brake,
      gear: c.n_gear,
      rpm: c.rpm,
    })),
  );

  // Units check: average speed from distance/time should match the speed channel.
  const metres = samples.d[samples.d.length - 1];
  const fromDistance = (metres / lapTime) * 3.6;
  const fromTelemetry = samples.speed.reduce((a, b) => a + b, 0) / samples.speed.length;
  console.log(
    `  ${positionOf(result)} ${driver.name_acronym} lap ${lap.lap_number}: ${lapTime}s, ${samples.t.length} samples, ` +
      `${(metres / 1000).toFixed(2)} km, avg ${fromDistance.toFixed(0)} km/h (telemetry ${fromTelemetry.toFixed(0)} km/h)`,
  );
  if (Math.abs(fromDistance / fromTelemetry - 1) > 0.05) {
    console.warn(`  ! ${driver.name_acronym}: distance and speed disagree by more than 5%; check position units`);
  }

  return {
    driver: driverInfo(driver),
    position: positionOf(result)!,
    lapNumber: lap.lap_number,
    lapTime,
    samples,
    startedAt: new Date(startMs).toISOString(),
    segment: segmentOf(result, lapTime),
    sectors: lapSectors(lap),
    personalBestSectors: bestSectors(laps),
    speedTrap: lap.st_speed,
    tyre: tyreForLap(stints, lap.lap_number),
  };
}

/**
 * Builds a session: each classified driver's fastest lap as its own file,
 * then the session file that lists them. A driver whose lap cannot be built,
 * or whose lap data is broken, is left out with a warning. Returns null when
 * OpenF1 has no lap data for the session (a cancelled session, or a gap in
 * OpenF1's records), so a later run can try again.
 */
export async function buildSession(sessionKey: number, outDir: string): Promise<SessionFile | null> {
  const [s] = await get<OpenF1Session>('sessions', [`session_key=${sessionKey}`]);
  if (!s) throw new Error(`OpenF1 has no session ${sessionKey}`);
  const [meeting] = await get<OpenF1Meeting>('meetings', [`meeting_key=${s.meeting_key}`]);
  console.log(`${meeting.meeting_name} ${s.year} - ${s.session_name} (session ${s.session_key})`);

  const allResults = (await get<OpenF1SessionResult>('session_result', [`session_key=${sessionKey}`])).sort(byPosition);
  const allLaps = await get<OpenF1Lap>('laps', [`session_key=${sessionKey}`]);
  if (allLaps.length === 0) {
    console.log(allResults.length ? '  OpenF1 has results but no lap data; skipped' : '  no timing data; skipped');
    return null;
  }
  const drivers = new Map(
    (await get<OpenF1Driver>('drivers', [`session_key=${sessionKey}`])).map((d) => [d.driver_number, d]),
  );
  const allStints = await get<OpenF1Stint>('stints', [`session_key=${sessionKey}`]);
  const weather = (await get<OpenF1Weather>('weather', [`session_key=${sessionKey}`]))
    .map(toWeather)
    .sort((a, b) => a.date.localeCompare(b.date));

  const dir = versionDir(outDir);
  const lapDir = join(dir, 'laps', String(sessionKey));
  await mkdir(lapDir, { recursive: true });
  const built: LapData[] = [];
  for (const result of allResults.filter((r) => positionOf(r) !== null)) {
    const driver = drivers.get(result.driver_number);
    const name = driver?.name_acronym ?? `#${result.driver_number}`;
    try {
      if (!driver) throw new Error('no driver details');
      built.push(
        await buildLap(
          sessionKey,
          result,
          driver,
          allLaps.filter((l) => l.driver_number === result.driver_number),
          allStints.filter((st) => st.driver_number === result.driver_number),
        ),
      );
    } catch (err) {
      console.warn(`  ! ${name}: ${err instanceof Error ? err.message : err}; left out`);
    }
  }

  // Laps whose source data is broken are left out rather than replayed wrongly.
  const typicalMetres = median(built.map((lap) => lapMetres(lap.samples)));
  const laps: LapSummary[] = [];
  for (const lap of built) {
    const problem = lapProblem(lap.samples, typicalMetres);
    if (problem) {
      console.warn(`  ! ${lap.driver.code}: ${problem}; left out`);
      continue;
    }
    const file = `laps/${sessionKey}/${lap.driver.number}.json`;
    const lapFile: LapFile = { version: DATA_VERSION, sessionKey, lap };
    await writeFile(join(dir, file), JSON.stringify(lapFile));
    const { samples: _, ...summary } = lap;
    laps.push({ ...summary, file });
  }
  if (laps.length === 0) throw new Error(`No laps could be built for session ${sessionKey}`);

  // A rebuild can leave files from drivers who are no longer listed.
  const keep = new Set(laps.map((l) => l.file.split('/').pop()));
  for (const name of await readdir(lapDir)) if (!keep.has(name)) await rm(join(lapDir, name));

  const classification = allResults.flatMap((r) => {
    const driver = drivers.get(r.driver_number);
    return driver ? [classificationRow(r, driverInfo(driver))] : [];
  });
  console.log(`  ${laps.length} laps, classification: ${classification.length} drivers, weather: ${weather.length} readings`);

  const session: SessionInfo = {
    key: s.session_key,
    meetingKey: s.meeting_key,
    year: s.year,
    meeting: meeting.meeting_name,
    name: s.session_name,
    circuit: s.circuit_short_name,
    country: s.country_name,
    date: new Date(Date.parse(s.date_start)).toISOString(),
    utcOffset: toUtcOffset(s.gmt_offset),
  };
  const file: SessionFile = {
    version: DATA_VERSION,
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    session,
    laps,
    classification,
    sessionBestSectors: bestSectors(allLaps),
    weather,
  };
  await mkdir(join(dir, 'sessions'), { recursive: true });
  await writeFile(join(dir, 'sessions', `${sessionKey}.json`), JSON.stringify(file));
  return file;
}

/** Round numbers already fetched, by season. */
const roundsByYear = new Map<number, Map<number, number>>();

/**
 * Rewrites index.json from the session files on disk, leaving the file (and
 * its date) alone when nothing in it has changed. Each weekend's outline is
 * traced from the pole lap of its qualifying (or its first session).
 */
export async function writeIndex(outDir: string): Promise<DataIndex> {
  const dir = versionDir(outDir);
  const names = (await readdir(join(dir, 'sessions')).catch(() => [])).filter((n) => n.endsWith('.json')).sort();
  const sessions = await Promise.all(
    names.map(async (n) => ({
      file: `sessions/${n}`,
      data: JSON.parse(await readFile(join(dir, 'sessions', n), 'utf8')) as SessionFile,
    })),
  );

  const rounds = new Map<number, number>();
  for (const year of new Set(sessions.map((s) => s.data.session.year))) {
    if (!roundsByYear.has(year)) roundsByYear.set(year, raceRounds(await get<OpenF1Meeting>('meetings', [`year=${year}`])));
    for (const [key, round] of roundsByYear.get(year)!) rounds.set(key, round);
  }

  const outlines = new Map<number, string>();
  for (const { data } of sessions) {
    const key = data.session.meetingKey ?? data.session.key;
    const pole = data.laps[0];
    if (!pole || (outlines.has(key) && data.session.name !== 'Qualifying')) continue;
    const { lap } = JSON.parse(await readFile(join(dir, pole.file), 'utf8')) as LapFile;
    outlines.set(key, outlinePath(lap.samples.x, lap.samples.y, OUTLINE_BOX.width, OUTLINE_BOX.height));
  }

  const path = join(dir, 'index.json');
  const events = groupEvents(sessions, rounds, outlines);
  const previous = await readFile(path, 'utf8').then(
    (text) => JSON.parse(text) as DataIndex,
    () => null,
  );
  if (previous && JSON.stringify(previous.events) === JSON.stringify(events)) return previous;
  const index: DataIndex = { version: DATA_VERSION, generatedAt: new Date().toISOString(), events };
  await writeFile(path, JSON.stringify(index, null, 2) + '\n');
  return index;
}
