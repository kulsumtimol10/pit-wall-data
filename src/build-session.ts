// Builds one session's JSON file from OpenF1 and adds it to the index.
//
//   npm run build:session -- --year 2025 --country Belgium
//   npm run build:session -- --year 2025 --country Belgium --session Qualifying --top 2
//
// Writes out/v1/laps/<session_key>.json and updates out/v1/index.json.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildLapSamples } from './lib/lap';
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
} from './lib/openf1';
import { DATA_VERSION, type DataIndex, type LapData, type SessionFile, type SessionInfo } from './types';

/** Extra seconds of readings fetched either side of a lap, so its edges interpolate cleanly. */
const EDGE_MARGIN_MS = 2000;
/** A lap matches the official best time if it is within this many seconds. */
const TIME_MATCH_S = 0.002;

interface Options {
  year: number;
  country: string;
  session: string;
  top: number;
  outDir: string;
}

function parseArgs(argv: string[]): Options {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
      throw new Error(`Expected --name value pairs, got: ${argv.join(' ')}`);
    }
    args.set(argv[i].slice(2), argv[i + 1]);
  }
  const year = Number(args.get('year'));
  const country = args.get('country');
  if (!year || !country) {
    throw new Error('Usage: npm run build:session -- --year 2025 --country Belgium [--session Qualifying] [--top 2]');
  }
  return {
    year,
    country,
    session: args.get('session') ?? 'Qualifying',
    top: Number(args.get('top') ?? 2),
    outDir: args.get('out') ?? 'out',
  };
}

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
  if (timed.length === 0) throw new Error(`No timed laps for driver ${laps[0]?.driver_number}`);
  const matching = best === null ? undefined : timed.find((l) => Math.abs(l.lap_duration! - best) < TIME_MATCH_S);
  return matching ?? timed.reduce((a, b) => (b.lap_duration! < a.lap_duration! ? b : a));
}

async function buildLap(
  sessionKey: number,
  result: OpenF1SessionResult,
  driver: OpenF1Driver,
  laps: OpenF1Lap[],
): Promise<LapData> {
  const best = officialBest(result);
  const lap = pickLap(laps, best);
  const lapTime = lap.lap_duration!;
  if (best !== null && Math.abs(lapTime - best) >= TIME_MATCH_S) {
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
    `  ${driver.name_acronym} lap ${lap.lap_number}: ${lapTime}s, ${samples.t.length} samples, ` +
      `${(metres / 1000).toFixed(2)} km, avg ${fromDistance.toFixed(0)} km/h (telemetry ${fromTelemetry.toFixed(0)} km/h)`,
  );
  if (Math.abs(fromDistance / fromTelemetry - 1) > 0.05) {
    console.warn(`  ! ${driver.name_acronym}: distance and speed disagree by more than 5%; check position units`);
  }

  return {
    driver: {
      number: driver.driver_number,
      code: driver.name_acronym,
      name: driver.full_name,
      team: driver.team_name,
      teamColour: driver.team_colour ?? '888888',
    },
    position: result.position!,
    lapNumber: lap.lap_number,
    lapTime,
    samples,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const sessions = await get<OpenF1Session>('sessions', [
    `year=${opts.year}`,
    `country_name=${opts.country}`,
    `session_name=${opts.session}`,
  ]);
  if (sessions.length !== 1) {
    throw new Error(`Expected one ${opts.year} ${opts.country} ${opts.session} session, found ${sessions.length}`);
  }
  const s = sessions[0];
  const [meeting] = await get<OpenF1Meeting>('meetings', [`meeting_key=${s.meeting_key}`]);
  console.log(`${meeting.meeting_name} ${s.year} - ${s.session_name} (session ${s.session_key})`);

  const results = (await get<OpenF1SessionResult>('session_result', [`session_key=${s.session_key}`]))
    .filter((r) => r.position !== null)
    .sort((a, b) => a.position! - b.position!)
    .slice(0, opts.top);
  const drivers = new Map(
    (await get<OpenF1Driver>('drivers', [`session_key=${s.session_key}`])).map((d) => [d.driver_number, d]),
  );
  const allLaps = await get<OpenF1Lap>('laps', [`session_key=${s.session_key}`]);

  const laps: LapData[] = [];
  for (const result of results) {
    const driver = drivers.get(result.driver_number);
    if (!driver) throw new Error(`No driver info for #${result.driver_number}`);
    const driverLaps = allLaps.filter((l) => l.driver_number === result.driver_number);
    laps.push(await buildLap(s.session_key, result, driver, driverLaps));
  }

  const session: SessionInfo = {
    key: s.session_key,
    year: s.year,
    meeting: meeting.meeting_name,
    name: s.session_name,
    circuit: s.circuit_short_name,
    country: s.country_name,
    date: new Date(Date.parse(s.date_start)).toISOString(),
  };
  const generatedAt = new Date().toISOString();
  const file: SessionFile = {
    version: DATA_VERSION,
    generatedAt,
    source: 'OpenF1 (openf1.org), CC BY-NC-SA 4.0',
    session,
    laps,
  };

  const versionDir = join(opts.outDir, `v${DATA_VERSION}`);
  const relPath = `laps/${s.session_key}.json`;
  await mkdir(join(versionDir, 'laps'), { recursive: true });
  await writeFile(join(versionDir, relPath), JSON.stringify(file));

  const indexPath = join(versionDir, 'index.json');
  const index: DataIndex = await readFile(indexPath, 'utf8')
    .then((text) => JSON.parse(text) as DataIndex)
    .catch(() => ({ version: DATA_VERSION, generatedAt, sessions: [] }));
  index.generatedAt = generatedAt;
  index.sessions = [
    { ...session, file: relPath, drivers: laps.map((l) => l.driver.code) },
    ...index.sessions.filter((e) => e.key !== session.key),
  ].sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');

  console.log(`Wrote ${join(versionDir, relPath)} and updated ${indexPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
