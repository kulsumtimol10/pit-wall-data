// The published data format. This file is the master copy:
// pit-wall-web keeps an identical copy in src/lib/data-types.ts.
// Bump DATA_VERSION and publish under a new /vN/ path for breaking changes.
// New optional fields are not breaking: older readers ignore them.
//
// v2: a session file lists every driver's fastest lap without its telemetry,
// and each lap's telemetry is a file of its own, so the site downloads only
// the two laps it compares. The index groups sessions by race weekend. The v1
// files (one file per session with two laps' telemetry) stay published,
// unchanged, for copies of the site that still read them.

export const DATA_VERSION = 2;

export interface SessionInfo {
  key: number;
  /** OpenF1 meeting key of the race weekend */
  meetingKey?: number;
  year: number;
  /** e.g. "Belgian Grand Prix" */
  meeting: string;
  /** e.g. "Qualifying" */
  name: string;
  /** e.g. "Spa-Francorchamps" */
  circuit: string;
  country: string;
  /** Session start, ISO 8601 UTC */
  date: string;
  /** Local time at the circuit relative to UTC, e.g. "+02:00" */
  utcOffset?: string;
}

export interface DriverInfo {
  number: number;
  /** Three-letter code, e.g. "NOR" */
  code: string;
  name: string;
  team: string;
  /** Hex colour without '#', e.g. "F47600" */
  teamColour: string;
}

/**
 * One lap as parallel arrays (index i in every array is the same moment).
 * Positions are metres in OpenF1's frame: x/y across the map, z up.
 */
export interface LapSamples {
  /** Seconds since the lap started; first value 0, last value = lapTime */
  t: number[];
  /** Metres driven since the start line */
  d: number[];
  x: number[];
  y: number[];
  z: number[];
  /** km/h */
  speed: number[];
  /** 0-100 % */
  throttle: number[];
  /** 0 or 100 */
  brake: number[];
  gear: number[];
  rpm: number[];
}

/** Qualifying segment a lap was set in. */
export type Segment = 'Q1' | 'Q2' | 'Q3';

/** Sector times in seconds; null where timing has no value. */
export type Sectors = [number | null, number | null, number | null];

export interface Tyre {
  /** "SOFT", "MEDIUM", "HARD", "INTERMEDIATE" or "WET" */
  compound: string;
  /** Laps already done on this set when the lap started (out-laps count) */
  age: number;
  /** The set was brand new when it went on the car */
  newSet: boolean;
}

/** A driver's fastest lap: its times and details, without the telemetry. */
export interface LapSummary {
  driver: DriverInfo;
  /** Classified position in the session */
  position: number;
  lapNumber: number;
  /** Seconds */
  lapTime: number;
  /** When the lap started, ISO 8601 UTC */
  startedAt?: string;
  /** Qualifying segment the lap was set in, if it matches an official segment time */
  segment?: Segment | null;
  /** Official sector times for this lap */
  sectors?: Sectors;
  /** This driver's best time in each sector across the session */
  personalBestSectors?: Sectors;
  /** Speed trap reading on this lap, km/h */
  speedTrap?: number | null;
  tyre?: Tyre | null;
  /** This lap's LapFile, relative to the /vN/ folder, e.g. "laps/9935/4.json" */
  file: string;
}

/** A lap with its telemetry. */
export interface LapData extends Omit<LapSummary, 'file'> {
  samples: LapSamples;
}

/** One lap's telemetry, published as its own file. */
export interface LapFile {
  version: typeof DATA_VERSION;
  /** The session the lap was set in */
  sessionKey: number;
  lap: LapData;
}

/** One driver's line in the official classification. */
export interface ClassificationRow {
  /** null when not classified */
  position: number | null;
  driver: DriverInfo;
  /** Qualifying: best time in Q1, Q2, Q3 (null where not set). Other sessions: one entry. */
  times: (number | null)[];
  laps: number;
  status: 'DNF' | 'DNS' | 'DSQ' | null;
}

/** One weather reading; OpenF1 sends about one a minute. */
export interface WeatherReading {
  /** ISO 8601 UTC */
  date: string;
  /** °C */
  airTemp: number;
  /** °C */
  trackTemp: number;
  /** % */
  humidity: number;
  /** mbar */
  pressure: number;
  rainfall: boolean;
  /** m/s */
  windSpeed: number;
  /** Degrees, 0 = north */
  windDirection: number;
}

/** One session: every driver's fastest lap (telemetry in separate LapFiles), the classification and the weather. */
export interface SessionFile {
  version: typeof DATA_VERSION;
  generatedAt: string;
  source: string;
  session: SessionInfo;
  /** Every driver with a timed lap, in classification order */
  laps: LapSummary[];
  /** Every driver in the session, in classification order */
  classification?: ClassificationRow[];
  /** Fastest time in each sector by anyone in the session */
  sessionBestSectors?: Sectors;
  /** Weather through the session, oldest first */
  weather?: WeatherReading[];
}

export interface SessionSummary extends SessionInfo {
  /** This session's SessionFile, relative to the /vN/ folder, e.g. "sessions/9935.json" */
  file: string;
  /** Codes of the drivers with a lap, in position order */
  drivers: string[];
}

/** A race weekend and the sessions published from it. */
export interface EventSummary {
  /** OpenF1 meeting key */
  key: number;
  year: number;
  /** Round of the championship, counting race weekends only (not testing) */
  round: number;
  /** e.g. "Belgian Grand Prix" */
  meeting: string;
  circuit: string;
  country: string;
  /** Start of the weekend's first published session, ISO 8601 UTC */
  date: string;
  /** The circuit as an SVG path fitted in a 56 × 38 box, traced from the fastest lap */
  outline?: string;
  sessions: SessionSummary[];
}

export interface DataIndex {
  version: typeof DATA_VERSION;
  generatedAt: string;
  /** Newest season first, rounds in order within each season */
  events: EventSummary[];
}
