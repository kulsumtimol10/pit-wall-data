// The published data format. This file is the master copy:
// pit-wall-web keeps an identical copy in src/lib/data-types.ts.
// Bump DATA_VERSION and publish under a new /vN/ path for breaking changes.

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

export interface LapData {
  driver: DriverInfo;
  /** Classified position in the session */
  position: number;
  lapNumber: number;
  /** Seconds */
  lapTime: number;
  samples: LapSamples;
}

export interface SessionFile {
  version: typeof DATA_VERSION;
  generatedAt: string;
  source: string;
  session: SessionInfo;
  /** Ordered by position */
  laps: LapData[];
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
