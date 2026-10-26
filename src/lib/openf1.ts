// Minimal OpenF1 client. Free tier: 3 requests/s and 30 requests/min,
// so requests are spaced at least MIN_INTERVAL_MS apart.
// Docs: https://openf1.org/docs

const BASE_URL = 'https://api.openf1.org/v1';
const MIN_INTERVAL_MS = 2100;
const MAX_ATTEMPTS = 4;

export interface OpenF1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
  year: number;
}

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
}

export interface OpenF1Driver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string | null;
}

export interface OpenF1SessionResult {
  driver_number: number;
  position: number | null;
  /** Qualifying: [Q1, Q2, Q3] in seconds (null where not set); other sessions: one number */
  duration: number | (number | null)[] | null;
}

export interface OpenF1Lap {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
}

export interface OpenF1Location {
  date: string;
  x: number;
  y: number;
  z: number;
}

export interface OpenF1CarData {
  date: string;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  rpm: number;
}

let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Formats a time for OpenF1's date filters (UTC, no zone suffix). */
export function toQueryDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, -1);
}

/**
 * GET an endpoint. `filters` are raw query parts, so comparisons work:
 * get('laps', ['session_key=9935', 'lap_duration<100.6']).
 */
export async function get<T>(endpoint: string, filters: string[]): Promise<T[]> {
  const url = `${BASE_URL}/${endpoint}?${filters.map(encodeFilter).join('&')}`;
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) return (await res.json()) as T[];
    // OpenF1 answers 404 when a filter matches nothing.
    if (res.status === 404) return [];
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`OpenF1 ${res.status} for ${url}: ${(await res.text()).slice(0, 200)}`);
    }
    await sleep(2000 * attempt);
  }
}

/** Encodes the value part of `key<op>value` while keeping the operator readable. */
function encodeFilter(filter: string): string {
  const match = /^([a-z_]+)(<=|>=|<|>|=)(.*)$/.exec(filter);
  if (!match) throw new Error(`Bad filter: ${filter}`);
  const [, key, op, value] = match;
  return `${key}${op}${encodeURIComponent(value)}`;
}
