// The published data format. This file is the master copy:
// pit-wall-web keeps an identical copy in src/lib/data-types.ts.
// Bump DATA_VERSION and publish under a new /vN/ path for breaking changes.
// New optional fields are not breaking: older readers ignore them.

export const DATA_VERSION = 1;

export interface SessionInfo {
  key: number;
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

export interface LapData {
  driver: DriverInfo;
  /** Classified position in the session */
  position: number;
  lapNumber: number;
  /** Seconds */
  lapTime: number;
  samples: LapSamples;
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

export interface SessionFile {
  version: typeof DATA_VERSION;
  generatedAt: string;
  source: string;
  session: SessionInfo;
  /** Ordered by position */
  laps: LapData[];
  /** Every driver in the session, in classification order */
  classification?: ClassificationRow[];
  /** Fastest time in each sector by anyone in the session */
  sessionBestSectors?: Sectors;
  /** Weather through the session, oldest first */
  weather?: WeatherReading[];
}

export interface SessionSummary extends SessionInfo {
  /** Path relative to the /vN/ folder, e.g. "laps/9935.json" */
  file: string;
  /** Driver codes in position order */
  drivers: string[];
}

export interface DataIndex {
  version: typeof DATA_VERSION;
  generatedAt: string;
  /** Newest first */
  sessions: SessionSummary[];
}
